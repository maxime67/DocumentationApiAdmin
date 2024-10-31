const express = require('express');
const router = express.Router();
const { MongoClient, ObjectId} = require('mongodb');
const { body,validationResult } = require('express-validator');

require('dotenv').config();

// MongoDB connection configuration
const mongoUri = process.env.MONGOURL;
const dbName = 'documentation';
const validateDocument = [
  // Basic document info
  body('title').notEmpty().trim().isString()
      .withMessage('Title is required and must be a string'),
  body('description').notEmpty().trim().isString()
      .withMessage('Description is required and must be a string'),
  body('url').notEmpty().trim().isURL()
      .withMessage('Valid URL is required'),
  body('category').isIn(['apache', 'nodejs', 'mongodb', 'mysql'])
      .withMessage('Category must be one of: apache, nodejs, mongodb, mysql'),
  body('tags').isArray().withMessage('Tags must be an array'),
  body('tags.*').isString().withMessage('Each tag must be a string'),
  body('status').isIn(['draft', 'published', 'archived'])
      .withMessage('Status must be one of: draft, published, archived'),
];

// Reusable MongoDB connection function
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

router.post('/', validateDocument, async (req, res) => {
  let client;
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const newDoc = {
      _id: req.body._id || new ObjectId(), // Preserve existing ID or create new one
      createdAt: new Date(),
      title: req.body.title,
      description: req.body.description,
      url: req.body.url,
      category: req.body.category,
      tags: req.body.tags,
      status: req.body.status,
    };

    client = await getMongoClient();
    const db = client.db(dbName);

    const result = await db.collection('object').insertOne(newDoc);

    res.status(201).json({
      message: 'Document created successfully',
      documentId: result.insertedId
    });

  } catch (error) {
    console.error('Error creating document:', error);
    res.status(500).json({ error: `Internal server error: ${error.message}` });
  } finally {
    if (client) {
      await client.close();
    }
  }
});

// Update existing document
router.put('/:id', async (req, res) => {
  let client;
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;

    // Validate ObjectId
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    client = await getMongoClient();
    const db = client.db(dbName);

    // Get existing document
    const existingDoc = await db.collection('object').findOne({
      _id: new ObjectId(id)
    });

    if (!existingDoc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Prepare update document
    const updateDoc = {
      createdAt: new Date(),
      title: req.body.title,
      description: req.body.description,
      url: req.body.url,
      category: req.body.category,
      tags: req.body.tags,
      status: req.body.status,
    };

    // Perform update
    const result = await db.collection('object').replaceOne(
        { _id: new ObjectId(id) },
        updateDoc
    );

    if (result.modifiedCount === 0) {
      return res.status(400).json({ error: 'Document update failed' });
    }

    res.json({
      message: 'Document updated successfully',
      documentId: id
    });

  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({ error: `Internal server error: ${error.message}` });
  } finally {
    if (client) {
      await client.close();
    }
  }
});


// Get all documents
router.get('/', async (req, res) => {
  let client;
  try {
    client = await getMongoClient();
    const db = client.db(dbName);

    const documents = await db.collection('object')
        .find({status : "published"})
        .toArray();

    res.json(documents);
  } catch (error) {
    console.error('Error fetching all documents:', error);
    res.status(500).json({ error: `Internal server error: ${error.message}` });
  } finally {
    if (client) {
      await client.close();
    }
  }
});

// Get documents by category
router.get('/category/:category',async (req, res) => {
  let client;
  try {
    const { category } = req.params;

    // Validate category
    const validCategories = ['apache', 'nodejs', 'mongodb', 'mysql'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category. Must be one of: API, Tutorial, Guide, Reference, Other' });
    }

    client = await getMongoClient();
    const db = client.db(dbName);

    const documents = await db.collection('object')
        .find({ category: category, status: "published" })
        .toArray();

    res.json(documents);
  } catch (error) {
    console.error('Error fetching documents by category:', error);
    res.status(500).json({ error: `Internal server error: ${error.message}` });
  } finally {
    if (client) {
      await client.close();
    }
  }
});

module.exports = router;