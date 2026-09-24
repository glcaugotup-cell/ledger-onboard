// Tests upload real files through multer; keep them out of the app's own uploads/ folder.
process.env.UPLOAD_DIR = 'tests/.tmp-uploads';
