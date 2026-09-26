const { body, query } = require('express-validator');
const { ROLES, ACCOUNT_STATUS } = require('../utils/constants');

const listUsersValidators = [
  query('role').optional().isIn(Object.values(ROLES)),
  query('accountStatus').optional().isIn(Object.values(ACCOUNT_STATUS)),
];

// Suspending or deactivating needs a reason (chosen from the standard list or typed under "Other").
const reasonChain = body('reason')
  .trim()
  .notEmpty()
  .withMessage('Select or enter a reason')
  .bail()
  .isLength({ max: 500 })
  .withMessage('Reason must be at most 500 characters');

const setUserStatusValidators = [
  body('status').isIn([ACCOUNT_STATUS.ACTIVE, ACCOUNT_STATUS.SUSPENDED, ACCOUNT_STATUS.DEACTIVATED]).withMessage('Invalid account status'),
  body('reason')
    .if(body('status').isIn([ACCOUNT_STATUS.SUSPENDED, ACCOUNT_STATUS.DEACTIVATED]))
    .trim()
    .notEmpty()
    .withMessage('Select or enter a reason')
    .bail()
    .isLength({ max: 500 })
    .withMessage('Reason must be at most 500 characters'),
  body('reason').optional().trim().isLength({ max: 500 }).withMessage('Reason must be at most 500 characters'),
];

const deactivateInactiveValidators = [reasonChain];

module.exports = { listUsersValidators, setUserStatusValidators, deactivateInactiveValidators };
