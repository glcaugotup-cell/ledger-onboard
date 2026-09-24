const fs = require('fs');
const path = require('path');

module.exports = async () => {
  fs.rmSync(path.join(__dirname, '..', '.tmp-uploads'), { recursive: true, force: true });
};
