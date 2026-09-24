const { body, query } = require('express-validator');
const { ROLES, ACCOUNT_STATUS } = require('../utils/constants');

const listUsersValidators = [
  query('role').optional().isIn(Object.values(ROLES)),
  query('accountStatus').optional().isIn(Object.values(ACCOUNT_STATUS)),
];

const setUserStatusValidators = [
  body('status').isIn([ACCOUNT_STATUS.ACTIVE, ACCOUNT_STATUS.SUSPENDED, ACCOUNT_STATUS.DEACTIVATED]),
  body('reason').optional().trim().isLength({ max: 500 }),
];

module.exports = { listUsersValidators, setUserStatusValidators };
