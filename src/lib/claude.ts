import { Anthropic } from '@anthropic-ai/sdk'

interface Container {
  containerNumber: string
  sealNumber: string
  type: string
  product: {
    name: string
    description: string
    hsCode: string
  }
  quantity: {
    volume: {
      liters: number
      gallons: number
    }
    weight: {
      kg: number
      lbs: number
      mt: number
    }
  }
}

interface ProcessedDocument {
  shipmentDetails: {
    bolNumber: string
    bookingNumber: string
    vesselName: string
    voyageNumber: string
    portOfLoading: string
    portOfDischarge: string
    dateOfIssue: string
    shipmentDate: string
  }
  parties: {
    shipper: {
      name: string
      address: string
      taxId: string
    }
    consignee: {
      name: string
      address: string
      taxId: string
    }
    notifyParty: {
      name: string
      address: string
    }
  }
  containers: Container[]
  commercial: {
    currency: string
    freightTerms: string
    itnNumber: string
  }
}

// Add retry configuration
const MAX_RETRIES = 3
const RETRY_DELAY = 1000 // 1 second

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

async function callClaudeWithRetry(
  systemPrompt: string,
  userPrompt: string,
  document: { type: 'pdf' | 'image'; data: string },
  retryCount = 0
): Promise<any> {
  try {
    const contentBlock = document.type === 'pdf' 
      ? {
          type: 'document' as const,
          source: {
            type: 'base64' as const,
            media_type: 'application/pdf' as const,
            data: document.data.replace(/^data:application\/pdf;base64,/, '')
          }
        }
      : {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: 'image/png' as const,
            data: document.data.replace(/^data:image\/png;base64,/, '')
          }
        };

    const message = await anthropic.messages.create({
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 1024,
      temperature: 0,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: userPrompt
            },
            contentBlock
          ]
        }
      ]
    })
    return message
  } catch (error: any) {
    // Check if we should retry
    if (retryCount < MAX_RETRIES && (
      error.status === 429 || // Too Many Requests
      error.status === 500 || // Internal Server Error
      error.status === 503 || // Service Unavailable
      error.message?.includes('overloaded') ||
      error.type === 'overloaded_error'
    )) {
      console.log(`Retry attempt ${retryCount + 1} after error:`, error.message)
      await sleep(RETRY_DELAY * Math.pow(2, retryCount)) // Exponential backoff
      return callClaudeWithRetry(systemPrompt, userPrompt, document, retryCount + 1)
    }
    throw error
  }
}

export async function processDocumentWithClaude(
  document: { type: 'pdf' | 'image'; data: string },
  template?: string
) {
  try {
    console.log(`Processing ${document.type} document`)
    
    const systemPrompt = `You are a logistics document parser specializing in Bills of Lading (BOL).
Your task is to analyze the provided Bill of Lading ${document.type} and extract specific information in a structured JSON format.

CRITICAL RULES:
- Extract ALL information EXACTLY as shown in the document
- For the BOL number, use ONLY the number shown in "B/L No." field
- Convert measurements to all requested units
- Create separate entries for each container/item
- Use empty string "" for missing text fields
- Use 0 for missing numerical values
- Preserve exact formatting of numbers, dates, and identifiers
- Return ONLY the JSON object, no additional text or explanations

Pay special attention to:
1. The document header for BOL number, vessel details, and dates
2. The "PARTICULARS FURNISHED BY SHIPPER" section for container details
3. The shipper, consignee, and notify party sections for complete address information`

    const userPrompt = `I'm providing you with a Bill of Lading document.
Please analyze it and extract the information into the following JSON structure.
Pay special attention to the "PARTICULARS FURNISHED BY SHIPPER" section for container details.

Return this EXACT JSON structure with the values found:
{
  "shipmentDetails": {
    "bolNumber": "",        // From "B/L No." field in header
    "bookingNumber": "",    // From booking reference if available
    "vesselName": "",       // Vessel name only
    "voyageNumber": "",     // Voyage number if available
    "portOfLoading": "",    // Port of loading
    "portOfDischarge": "",  // Port of discharge
    "dateOfIssue": "",     // Date of issue
    "shipmentDate": ""     // Shipment/onboard date
  },
  "parties": {
    "shipper": {
      "name": "",          // Company name from shipper section
      "address": "",       // Complete address
      "taxId": ""         // Tax ID/RIF if shown
    },
    "consignee": {
      "name": "",         // Company name from consignee section
      "address": "",      // Complete address
      "taxId": ""        // Tax ID/RIF if shown
    },
    "notifyParty": {
      "name": "",        // From notify party section
      "address": ""     // Complete address
    }
  },
  "containers": [
    {
      "containerNumber": "",  // Container number from cargo details
      "sealNumber": "",      // Seal number
      "type": "",           // Container type (e.g., "DRY")
      "product": {
        "name": "",         // Product name
        "description": "",  // Full product description
        "hsCode": ""       // HS Code if available
      },
      "quantity": {
        "volume": {
          "liters": 0,     // Convert to liters if needed
          "gallons": 0     // Convert to gallons if needed
        },
        "weight": {
          "kg": 0,         // Weight in KG
          "lbs": 0,        // Convert to pounds
          "mt": 0          // Convert to metric tons
        }
      }
    }
  ],
  "commercial": {
    "currency": "",        // Currency code if shown
    "freightTerms": "",    // Freight/shipping terms
    "itnNumber": ""       // ITN number if available
  }
}`

    console.log('Calling Claude API')
    const message = await callClaudeWithRetry(systemPrompt, userPrompt, document)

    const firstContent = message.content[0]
    if (!firstContent || firstContent.type !== 'text') {
      console.error('Invalid Claude response format:', message)
      throw new Error('Invalid response format from Claude')
    }

    try {
      // Try to find a JSON object in the response
      const text = firstContent.text.trim()
      console.log('Claude response text:', text)
      
      let jsonStr = text
      // If the response contains more than just JSON, try to extract it
      if (!text.startsWith('{') || !text.endsWith('}')) {
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
          console.error('No JSON object found in response:', text)
          throw new Error('No JSON object found in Claude response')
        }
        jsonStr = jsonMatch[0]
      }

      // Parse the JSON and validate required fields
      const data = JSON.parse(jsonStr) as ProcessedDocument
      
      // Validate required fields with detailed error messages
      if (!data.shipmentDetails) {
        throw new Error('Missing shipmentDetails section')
      }
      if (!data.shipmentDetails.bolNumber) {
        throw new Error('Missing BOL number in shipmentDetails')
      }
      if (!data.parties) {
        throw new Error('Missing parties section')
      }
      if (!data.parties.shipper) {
        throw new Error('Missing shipper information in parties')
      }
      if (!data.parties.consignee) {
        throw new Error('Missing consignee information in parties')
      }
      if (!Array.isArray(data.containers)) {
        throw new Error('containers field is not an array')
      }
      if (data.containers.length === 0) {
        throw new Error('No containers found in document')
      }

      // Validate container data
      data.containers.forEach((container, index) => {
        if (!container.containerNumber) {
          throw new Error(`Missing containerNumber in container ${index + 1}`)
        }
        if (!container.product) {
          throw new Error(`Missing product information in container ${index + 1}`)
        }
      })

      // Trim whitespace from string fields
      data.shipmentDetails.bolNumber = data.shipmentDetails.bolNumber.trim()
      
      console.log('Successfully processed document:', {
        bolNumber: data.shipmentDetails.bolNumber,
        containerCount: data.containers.length
      })

      return data
    } catch (error) {
      console.error('Error parsing Claude response:', error)
      console.error('Response text:', firstContent.text)
      throw new Error(`Failed to parse Claude response: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  } catch (error) {
    console.error('Error in processDocumentWithClaude:', error)
    throw error
  }
} 