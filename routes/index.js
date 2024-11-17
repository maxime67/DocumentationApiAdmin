const express = require('express');
const router = express.Router();
const {MongoClient, ObjectId} = require('mongodb');
const res = require("express/lib/response");
require('dotenv').config();

// MongoDB connection configuration
const mongoUri = process.env.MONGOURL;

const dbName = 'doc2';


// MongoDB connection function
async function getMongoClient() {
  try {
    // Add proper options object and error handling
    const client = new MongoClient(mongoUri, {
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000,
    });

    // Connect explicitly
    await client.connect();
    console.log('Successfully connected to MongoDB');
    return client;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw new Error(`MongoDB connection failed: ${error.message}`);
  }
}

//
// Add category and subcategories if doesn't already exist
//
router.post('/add/category', async (req, res) => {
  let client;
  try {
    const { name, subcategories } = req.body;

    if (!name || !subcategories || !Array.isArray(subcategories)) {
      return res.status(400).json({ error: 'Invalid category data' });
    }

    client = await getMongoClient();
    const db = client.db(dbName);
    const categoriesCollection = db.collection('categories');

    const existingCategory = await categoriesCollection.findOne({ name });

    if (existingCategory) {
      const updatedSubcategories = [
        ...new Set([
          ...existingCategory.subcategories,
          ...subcategories
        ])
      ];

      await categoriesCollection.updateOne(
          { name },
          { $set: { subcategories: updatedSubcategories } }
      );

      res.json({
        message: 'Category updated successfully',
        addedSubcategories: subcategories.filter(sub =>
            !existingCategory.subcategories.includes(sub)
        )
      });
    } else {
      await categoriesCollection.insertOne({
        name,
        subcategories
      });

      res.json({
        message: 'Category created successfully',
        addedSubcategories: subcategories
      });
    }
  } catch (error) {
    console.error('Error managing categories:', error);
    res.status(500).json({
      error: `Internal server error: ${error.message}`
    });
  } finally {
    if (client) {
      await client.close();
    }
  }
});

//
// Get all categories with their subcategories
//
router.get('/categories', async (req, res) => {
  let client;
  try {
    client = await getMongoClient();
    const db = client.db(dbName);

    const categories = await db.collection('categories')
        .find()
        .toArray();

    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      error: `Internal server error: ${error.message}`
    });
  } finally {
    if (client) {
      await client.close();
    }
  }
});

//
// Create new document
//
router.post('/documentation', async (req, res) => {
  let client;
  try {
    // Validate required fields
    const requiredFields = ['title', 'description', 'category', 'tags', 'status'];
    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(400).json({
          error: `Missing required field: ${field}`
        });
      }
    }

    const newDoc = {
      title: req.body.title,
      description: req.body.description,
      url: req.body.url || '',
      category: req.body.category,
      tags: Array.isArray(req.body.tags) ? req.body.tags : [],
      status: req.body.status
    };

    client = await getMongoClient();
    const db = client.db(dbName);

    const result = await db.collection('documentation')
        .insertOne(newDoc);

    res.status(201).json({
      message: 'Documentation created successfully',
      documentId: result.insertedId,
      document: newDoc
    });

  } catch (error) {
    console.error('Error creating documentation:', error);
    res.status(500).json({
      error: `Internal server error: ${error.message}`
    });
  } finally {
    if (client) {
      await client.close();
    }
  }
});

//
// Get documents by multiple subcategories
//
router.get('/category', async (req, res) => {
  let client;
  try {
    client = await getMongoClient();
    const db = client.db(dbName);

    const categoriesData = await db.collection('categories').find().toArray();
    const validSubcategories = categoriesData.reduce((acc, category) => {
      return [...acc, ...category.subcategories.map(sub => sub.toLowerCase())];
    }, []);

    let subcategories = req.query.categories ? req.query.categories.split(',') : [];

    if (subcategories.length === 0) {
      subcategories = validSubcategories;
    } else {
      subcategories = subcategories.filter(cat => validSubcategories.includes(cat));

      if (subcategories.length === 0) {
        return res.status(400).json({
          error: `Invalid categories. Must be one or more of: ${validSubcategories.join(', ')}`,
          validSubcategories: validSubcategories
        });
      }
    }

    const documents = await db.collection('documentation')
        .find({
          category: {$in: subcategories},
          status: "published"
        })
        .toArray();

    const response = {
      totalDocuments: documents.length,
      results: documents
    };
    res.json(response);
  } catch (error) {
    console.error('Error fetching documents by categories:', error);
    res.status(500).json({
      error: `Internal server error: ${error.message}`
    });
  } finally {
    if (client) {
      await client.close();
    }
  }
});


//
// Update existing document
//
router.put('/documentation/:id', async (req, res) => {
  let client;
  try {
    const documentId = req.params.id;

    // Validate ObjectId format
    if (!ObjectId.isValid(documentId)) {
      return res.status(400).json({
        error: 'Invalid document ID format'
      });
    }

    // Validate request body
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({
        error: 'Request body cannot be empty'
      });
    }

    client = await getMongoClient();
    const db = client.db(dbName);

    // Remove _id from update data if it exists
    const updateData = { ...req.body };
    delete updateData._id;
    updateData.category = req.body.subcategories[0].toLowerCase();


    const result = await db.collection('documentation').updateOne(
        { _id: new ObjectId(documentId) },
        { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        error: 'Document not found'
      });
    }

    res.json({
      message: 'Document updated successfully',
      modifiedCount: result.modifiedCount
    });

  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({
      error: `Internal server error: ${error.message}`
    });
  } finally {
    if (client) {
      await client.close();
    }
  }
});


//
// Get document by ID
//
router.get('/documentation/:id', async (req, res) => {
  let client;
  try {
    const documentId = req.params.id;

    // Validate ObjectId format
    if (!ObjectId.isValid(documentId)) {
      return res.status(400).json({
        error: 'Invalid document ID format'
      });
    }

    client = await getMongoClient();
    const db = client.db(dbName);

    const document = await db.collection('documentation')
        .findOne({ _id: new ObjectId(documentId) });

    if (!document) {
      return res.status(404).json({
        error: 'Document not found'
      });
    }

    res.json(document);
  } catch (error) {
    console.error('Error fetching document by ID:', error);
    res.status(500).json({
      error: `Internal server error: ${error.message}`
    });
  } finally {
    if (client) {
      await client.close();
    }
  }
});

module.exports = router;