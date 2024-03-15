const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true
        },
        password: {
            type: String,
            required: true
        },
        roles: {
            type: [mongoose.Schema.Types.ObjectId],
            require: true,
            ref: "Roles"
        },
        enabled: {
            type: Boolean,
            require: true,
            default: true
        },
        verified: {
            type: Boolean,
            require: true,
            default: false
        }
    },
    {
        timestamps: true
    }
)

module.exports = mongoose.model('users', UserSchema);