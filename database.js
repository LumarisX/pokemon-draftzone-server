const mongoose = require("mongoose");

const mongodbUrl = "mongodb://localhost:27017";

const db = async() => {
    const con = await mongoose.connect( mongodbUrl )
    console.log(`mongodb connected ${con.connection.host}`);
}

module.exports = db;