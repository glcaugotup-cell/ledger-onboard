const { param } = require('express-validator');
const mongoose = require('mongoose');

const objectIdParam = (name = 'id') =>
  param(name).custom((value) => mongoose.isValidObjectId(value)).withMessage('Invalid identifier');

module.exports = { objectIdParam };
