const BaseRepository = require('./BaseRepository');
const MaintenanceIssue = require('../models/MaintenanceIssue');
class MaintenanceIssueRepository extends BaseRepository {
  constructor() { super(MaintenanceIssue); }
}
module.exports = new MaintenanceIssueRepository();
