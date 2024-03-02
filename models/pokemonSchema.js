const mongoose = require("mongoose");

const captSchema = new mongoose.Schema(
  {
    tera: {
      type: [String],
    },
  },
  { _id: false }
);

const pokemonSchema = new mongoose.Schema(
  {
    pid: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    shiny: Boolean,
    capt: {
      type: captSchema,
      default: function () {
        if (this.tera && this.tera.length > 0) {
          return { tera: this.tera };
        }
        return undefined;
      },
    },
  },
  { _id: false }
);

module.exports = pokemonSchema;
