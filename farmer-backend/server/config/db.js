const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI not defined in environment');
    }

    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: 'farmer-market'
    });

    console.log('✅ MongoDB connected');

  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1); // fail fast
  }
};

module.exports = connectDB;