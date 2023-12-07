const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
    username:{
        type: String,
        required: true
    },
    joinDate:{
        type: Date,
        required: true,
        default: Date.now
    }
})

module.exports = mongoose.model('users', userSchema);