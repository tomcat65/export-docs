import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { Document } from '@/models/Document'
import { Types } from 'mongoose'
import { apiFetch } from '@/lib/api-utils'

// Helper function to recursively convert ObjectIds to strings
function serializeObjectIds(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (obj instanceof Types.ObjectId) {
    return obj.toString();
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => serializeObjectIds(item));
  }
  
  if (typeof obj === 'object' && obj !== null) {
    const result: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        result[key] = serializeObjectIds(obj[key]);
      }
    }
    return result;
  }
  
  return obj;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const session = await auth()
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Extract and validate the ID parameter
    const { id } = await context.params
    if (!id || id === 'undefined') {
      return NextResponse.json({ error: 'Invalid client ID' }, { status: 400 })
    }

    // Connect to database
    const db = await connectDB()
    if (!db) {
      return NextResponse.json(
        { error: 'Database connection failed' },
        { status: 500 }
      )
    }

    // Find all documents for this client
    console.log(`Fetching documents for client ID: ${id}`);
    const query = { clientId: new Types.ObjectId(id) };
    console.log('Query:', JSON.stringify(query));

    // Clear any caching issues by explicitly setting clientId type
    const documents = await Document.find({ 
      clientId: { $eq: new Types.ObjectId(id) } 
    })
      .sort({ 'bolData.bolNumber': 1, createdAt: -1 })
      .lean();

    console.log(`Found ${documents.length} documents for client ${id}`);
    
    // Validate documents array
    if (!Array.isArray(documents)) {
      console.error('Query returned non-array result:', documents);
      return NextResponse.json(
        { error: 'Invalid document query result' },
        { status: 500 }
      );
    }
    
    if (documents.length > 0) {
      // Log first document
      console.log('First document:', {
        id: documents[0]._id,
        fileName: documents[0].fileName,
        type: documents[0].type
      });
    }

    // Serialize MongoDB documents with more robust error handling
    const serializedDocuments = documents.map(doc => {
      try {
        // Make sure each document has required fields before serializing
        if (!doc || typeof doc !== 'object') {
          console.error('Invalid document in results:', doc);
          return null;
        }
        
        // Ensure all required fields exist
        if (!doc._id || !doc.clientId || !doc.fileId) {
          console.error('Document missing required fields:', {
            hasId: !!doc._id,
            hasClientId: !!doc.clientId,
            hasFileId: !!doc.fileId,
            document: doc
          });
        }
        
        // Return serialized document with full debugging fields
        return {
          _id: (doc._id instanceof Types.ObjectId) ? doc._id.toString() : String(doc._id),
          clientId: (doc.clientId instanceof Types.ObjectId) ? doc.clientId.toString() : String(doc.clientId),
          fileName: doc.fileName || 'unnamed-document',
          fileId: (doc.fileId instanceof Types.ObjectId) ? doc.fileId.toString() : String(doc.fileId),
          type: doc.type || 'UNKNOWN',
          subType: doc.subType,
          relatedBolId: doc.relatedBolId ? 
            ((doc.relatedBolId instanceof Types.ObjectId) ? 
              doc.relatedBolId.toString() : String(doc.relatedBolId)) : 
            undefined,
          createdAt: doc.createdAt ? (doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt) : new Date().toISOString(),
          updatedAt: doc.updatedAt ? (doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt) : new Date().toISOString(),
          bolData: serializeObjectIds(doc.bolData),
          packingListData: serializeObjectIds(doc.packingListData),
          items: serializeObjectIds(doc.items)
        };
      } catch (error) {
        console.error('Error serializing document:', error, doc);
        // Return minimal document to prevent complete failure
        return {
          _id: String(doc._id || 'unknown-id'),
          clientId: String(doc.clientId || id),
          fileName: doc.fileName || 'error-document',
          fileId: String(doc.fileId || 'unknown-file'),
          type: doc.type || 'ERROR',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }
    }).filter(Boolean); // Remove any null entries from serialization errors

    // Debug log
    console.log(`Returning ${serializedDocuments.length} serialized documents`);

    return NextResponse.json({ documents: serializedDocuments })
  } catch (error) {
    console.error('Error fetching client documents:', error)
    return NextResponse.json(
      { error: 'Failed to fetch client documents' },
      { status: 500 }
    )
  }
}

// Client-side code example
async function checkDocument(documentId: string) {
  // Use the new apiFetch helper which handles absolute URLs
  const response = await apiFetch(`/api/documents/${documentId}/exists`);
  const data = await response.json();
  
  console.log('Document status:', data);
  
  if (!data.exists && data.possibleFileId) {
    console.log('Document can be repaired with file:', data.possibleFileId);
  }
}

// For testing purposes only - comment this out in production
// checkDocument('67c958dc57bfddf075c9391a'); 