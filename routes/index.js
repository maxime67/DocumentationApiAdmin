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

// Create new Category
router.post('/category', async (req, res) => {
  let client;
  try {
    // Validate required fields
    const requiredFields = ['name', 'label'];
    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(400).json({
          error: `Missing required field: ${field}`
        });
      }
    }

    // Create new technology object
    const newCategory = {
      name: req.body.name.toLowerCase(), // Store name in lowercase for consistency
      label: req.body.label
    };

    // Connect to MongoDB
    client = await getMongoClient();
    const db = client.db(dbName);

    // Check for duplicates using either name or label
    const existingCategory = await db.collection('documentation_categories')
        .findOne({
          $or: [
            { name: newCategory.name },
            { label: newCategory.label }
          ]
        });

    if (existingCategory) {
      return res.status(409).json({
        error: existingCategory.name === newCategory.name
            ? 'A technology with this name already exists'
            : 'A technology with this label already exists',
        existingTechnology: {
          name: existingCategory.name,
          label: existingCategory.label
        }
      });
    }

    // Insert the technology if no duplicates found
    const result = await db.collection('documentation_categories')
        .insertOne(newCategory);

    res.status(201).json({
      message: 'Technology created successfully',
      technologyId: result.insertedId,
      technology: newCategory
    });

  } catch (error) {
    console.error('Error creating technology:', error);
    res.status(500).json({
      error: `Internal server error: ${error.message}`
    });
  } finally {
    if (client) {
      await client.close();
    }
  }
});

router.post('/add/category', async (req, res) => {
  let client;
  try {
    const { name, subcategories } = req.body;

    if (!name || !subcategories || !Array.isArray(subcategories)) {
      return res.status(400).json({ error: 'Invalid category data' });
    }

    client = await getMongoClient();
    const db = client.db(dbName);

    await db.collection('categories').updateOne(
        { name: name },
        { $set: { name, subcategories } },
        { upsert: true }
    );

    res.json({ message: 'Category updated successfully' });
  } catch (error) {
    console.error('Error updating categories:', error);
    res.status(500).json({
      error: `Internal server error: ${error.message}`
    });
  } finally {
    if (client) {
      await client.close();
    }
  }
});

// Get all existing categories
router.get('/allCategories', async (req, res) => {
  let client;
  try {
    client = await getMongoClient();
    const db = client.db(dbName);

    const documents = await db.collection('documentation_categories')
        .find()
        .toArray();
    res.json(documents);
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

// Create new document
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

    // Create new document object with default values
    const newDoc = {
      title: req.body.title,
      description: req.body.description,
      url: req.body.url || '',
      category: req.body.category,
      tags: Array.isArray(req.body.tags) ? req.body.tags : [],
      status: req.body.status
    };

    // Connect to MongoDB
    client = await getMongoClient();
    const db = client.db(dbName);

    // Insert the document
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

// Get documents by multiple categories
router.get('/category', async (req, res) => {
  let client;
  try {
    // Get categories from query parameter, fallback to all valid categories if none specified
    let categories = req.query.categories ? req.query.categories.split(',') : [];

    // Define valid categories
    const validCategories = ['apache', 'nodejs', 'mongodb', 'mysql',"jenkins",'docker', 'kubernetes', 'gitLab','postgresql','redis', 'python', 'java', 'php','nginx'];

    // If no categories specified or invalid ones provided, use all valid categories
    if (categories.length === 0) {
      categories = validCategories;
    } else {
      // Filter out any invalid categories
      categories = categories.filter(cat => validCategories.includes(cat));

      // If all provided categories were invalid, return error
      if (categories.length === 0) {
        return res.status(400).json({
          error: `Invalid categories. Must be one or more of: ${validCategories.join(', ')}`,
          validCategories: validCategories
        });
      }
    }

    client = await getMongoClient();
    const db = client.db(dbName);

    // Create an object to store results for each category
    const results = {};

    // Initialize results object with empty arrays for all requested categories
    categories.forEach(category => {
      results[category] = [];
    });

    // Fetch documents for all requested categories in a single query
    const documents = await db.collection('documentation')
        .find({
          category: {$in: categories},
          status: "published"
        })
        .toArray();
    const response = {
      totalDocuments: documents.length,
      results: documents
    };
    res.json(response)
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

module.exports = router;