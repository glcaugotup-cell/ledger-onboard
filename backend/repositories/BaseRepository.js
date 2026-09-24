/**
 * Base class for every repository. Repositories are the only layer that uses
 * Mongoose models directly; they contain no business logic.
 */
class BaseRepository {
  constructor(model) {
    if (!model) throw new Error('BaseRepository requires a Mongoose model');
    this.model = model;
  }

  async create(data) {
    const doc = await this.model.create(data);
    return doc;
  }

  async findById(id, { select, populate } = {}) {
    let query = this.model.findById(id);
    if (select) query = query.select(select);
    if (populate) query = query.populate(populate);
    return query.exec();
  }

  async findOne(filter, { select, populate } = {}) {
    let query = this.model.findOne(filter);
    if (select) query = query.select(select);
    if (populate) query = query.populate(populate);
    return query.exec();
  }

  async find(filter = {}, { select, populate, sort, skip, limit } = {}) {
    let query = this.model.find(filter);
    if (select) query = query.select(select);
    if (populate) query = query.populate(populate);
    if (sort) query = query.sort(sort);
    if (typeof skip === 'number') query = query.skip(skip);
    if (typeof limit === 'number') query = query.limit(limit);
    return query.exec();
  }

  async count(filter = {}) {
    return this.model.countDocuments(filter);
  }

  async updateById(id, update, { new: returnNew = true, runValidators = true } = {}) {
    return this.model.findByIdAndUpdate(id, update, { new: returnNew, runValidators }).exec();
  }

  async deleteById(id) {
    return this.model.findByIdAndDelete(id).exec();
  }

  async aggregate(pipeline) {
    return this.model.aggregate(pipeline);
  }
}

module.exports = BaseRepository;
