import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import mongoose from 'mongoose';

export async function GET(request: NextRequest) {
  try {
    // Connect to database
    await connectDB();
    console.log('Connected to MongoDB');
    
    // Get database
    const db = mongoose.connection.db!;
    
    // Get collections
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    // Gather collection stats
    const stats: Record<string, any> = {};
    
    for (const name of collectionNames) {
      const count = await db.collection(name).countDocuments();
      stats[name] = { count };
      
      // Get sample documents
      if (count > 0 && name === 'documents') {
        const sample = await db.collection(name).find().limit(2).toArray();
        stats[name].sample = sample.map(doc => ({
          _id: doc._id.toString(),
          type: doc.type,
          fileName: doc.fileName,
          clientId: doc.clientId.toString()
        }));
      } else if (count > 0 && name === 'clients') {
        const sample = await db.collection(name).find().limit(2).toArray();
        stats[name].sample = sample.map(doc => ({
          _id: doc._id.toString(),
          name: doc.name,
          rif: doc.rif
        }));
      }
    }
    
    // Check GridFS collections
    const gridFsCollections = collectionNames.filter(name => name.endsWith('.files'));
    const gridFsBuckets = gridFsCollections.map(name => name.replace('.files', ''));
    
    const gridFsStats: Record<string, any> = {};
    
    for (const bucket of gridFsBuckets) {
      const filesCount = await db.collection(`${bucket}.files`).countDocuments();
      const chunksCount = await db.collection(`${bucket}.chunks`).countDocuments();
      
      gridFsStats[bucket] = {
        files: filesCount,
        chunks: chunksCount
      };
      
      if (filesCount > 0) {
        const sample = await db.collection(`${bucket}.files`).find().limit(2).toArray();
        gridFsStats[bucket].sample = sample.map(file => ({
          _id: file._id.toString(),
          filename: file.filename,
          length: file.length,
          contentType: file.contentType,
          uploadDate: file.uploadDate
        }));
      }
    }
    
    // Return all information
    return NextResponse.json({ 
      connected: true,
      databaseName: mongoose.connection.name,
      collections: collectionNames,
      stats,
      gridFS: {
        buckets: gridFsBuckets,
        stats: gridFsStats
      }
    });
  } catch (error: any) {
    console.error('Database check error:', error);
    return NextResponse.json({ 
      error: error.message,
      connected: false 
    }, { status: 500 });
  }
}