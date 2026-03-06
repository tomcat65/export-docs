import fetch from 'node-fetch';

async function main() {
  try {
    console.log('Starting simple API check...');
    
    // Use client ID from your logs
    const clientId = '67bd0efbbf7daebc63d0ca0a';
    
    console.log(`Checking documents for client ${clientId}...`);
    
    // Make a direct API call
    const response = await fetch(`http://localhost:3000/api/clients/${clientId}/documents?t=${Date.now()}`);
    
    if (!response.ok) {
      console.error(`Error: HTTP ${response.status}`);
      console.error(await response.text());
      return;
    }
    
    const data = await response.json();
    
    console.log(`Retrieved ${data.documents.length} documents`);
    
    // Display document info
    data.documents.forEach((doc, i) => {
      console.log(`Document ${i + 1}:`);
      console.log(`  ID: ${doc._id}`);
      console.log(`  Type: ${doc.type}`);
      console.log(`  Filename: ${doc.fileName}`);
      if (doc.type === 'BOL' && doc.bolData) {
        console.log(`  BOL Number: ${doc.bolData.bolNumber}`);
      }
      console.log('');
    });
    
    console.log('Check completed');
  } catch (error) {
    console.error('Error running check:', error);
  }
}

main();