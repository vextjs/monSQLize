'use strict';

function cloneDoc(doc) {
  return { ...doc };
}

class PopulateBuilder {
  constructor(model, collection) {
    this.model = model;
    this.collection = collection;
    this.populatePaths = [];
  }

  populate(pathOrConfig, options = {}) {
    if (typeof pathOrConfig === 'string') {
      this.populatePaths.push({ path: pathOrConfig, ...options });
      return this;
    }

    if (Array.isArray(pathOrConfig)) {
      pathOrConfig.forEach((path) => this.populate(path));
      return this;
    }

    if (pathOrConfig && typeof pathOrConfig === 'object') {
      this.populatePaths.push({ ...pathOrConfig });
      return this;
    }

    throw new Error('populate param must be a string or object');
  }

  _collectForeignIds(docs, relation) {
    const ids = new Set();
    for (const doc of docs) {
      const value = doc?.[relation.localField];
      if (Array.isArray(value)) {
        value.filter((item) => item !== null && item !== undefined).forEach((item) => ids.add(item));
      } else if (value !== null && value !== undefined) {
        ids.add(value);
      }
    }
    return Array.from(ids);
  }

  _buildRelationMap(relatedDocs, relation, config = {}) {
    const map = new Map();
    for (let relatedDoc of relatedDocs) {
      if (config.select) {
        relatedDoc = this._selectFields(relatedDoc, config.select);
      }
      const key = this._relationKey(relatedDoc?.[relation.foreignField]);
      if (relation.single) {
        map.set(key, relatedDoc);
      } else {
        const bucket = map.get(key) ?? [];
        bucket.push(relatedDoc);
        map.set(key, bucket);
      }
    }

    if (!relation.single && config.sort) {
      for (const [key, docs] of map.entries()) {
        map.set(key, this._sortDocs(docs, config.sort));
      }
    }

    if (!relation.single && Number.isFinite(config.limit) && config.limit > 0) {
      for (const [key, docs] of map.entries()) {
        map.set(key, docs.slice(0, config.limit));
      }
    }

    return map;
  }

  _fillDocuments(docs, path, relation, relatedMap) {
    for (const doc of docs) {
      const localValue = doc?.[relation.localField];
      if (relation.single) {
        doc[path] =
          localValue === null || localValue === undefined
            ? null
            : relatedMap.get(this._relationKey(localValue)) ?? null;
        continue;
      }

      if (localValue === null || localValue === undefined) {
        doc[path] = [];
      } else if (Array.isArray(localValue)) {
        doc[path] = localValue.flatMap((id) => relatedMap.get(this._relationKey(id)) ?? []);
      } else {
        doc[path] = relatedMap.get(this._relationKey(localValue)) ?? [];
      }
    }
  }

  _fillEmptyRelation(docs, path, relation) {
    for (const doc of docs) {
      doc[path] = relation.single ? null : [];
    }
  }

  _selectFields(doc, select) {
    const fields = String(select).split(/\s+/).filter(Boolean);
    const output = { _id: doc?._id };
    for (const field of fields) {
      if (doc && Object.prototype.hasOwnProperty.call(doc, field)) {
        output[field] = doc[field];
      }
    }
    return output;
  }

  _sortDocs(docs, sort) {
    return [...docs].sort((left, right) => {
      for (const [field, direction] of Object.entries(sort ?? {})) {
        if (left[field] === right[field]) {
          continue;
        }
        return left[field] > right[field] ? Number(direction) : -Number(direction);
      }
      return 0;
    });
  }

  _relationKey(value) {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === 'object') {
      if (typeof value.toHexString === 'function') {
        return value.toHexString();
      }
      if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString) {
        return value.toString();
      }
    }
    return String(value);
  }

  async execute(inputDocs) {
    if (!Array.isArray(inputDocs) || inputDocs.length === 0 || this.populatePaths.length === 0) {
      return inputDocs;
    }

    const docs = inputDocs.map((doc) => cloneDoc(doc));
    for (const config of this.populatePaths) {
      const relation = this.model?._relations?.get?.(config.path);
      if (!relation) {
        throw new Error(`未定义的关系: ${config.path}`);
      }

      const ids = this._collectForeignIds(docs, relation);
      if (ids.length === 0) {
        this._fillEmptyRelation(docs, config.path, relation);
        continue;
      }

      const relatedDocs = await this.model.msq.collection(relation.from).find({
        [relation.foreignField]: { $in: ids },
      }).toArray();
      const relationMap = this._buildRelationMap(relatedDocs, relation, config);
      this._fillDocuments(docs, config.path, relation, relationMap);
    }

    return docs;
  }
}

class PopulateProxy {
  constructor(docsOrPromise, builder, singleDoc = false) {
    this._docsOrPromise = docsOrPromise;
    this._builder = builder;
    this._singleDoc = singleDoc;
  }

  populate(path, options) {
    this._builder.populate(path, options);
    return this;
  }

  async _resolve() {
    const resolved = await Promise.resolve(this._docsOrPromise);
    const docs = Array.isArray(resolved) ? resolved : [resolved];
    const populated = await this._builder.execute(docs.filter((doc) => doc !== null && doc !== undefined));
    return this._singleDoc ? populated[0] ?? null : populated;
  }

  then(onFulfilled, onRejected) {
    return this._resolve().then(onFulfilled, onRejected);
  }

  catch(onRejected) {
    return this._resolve().catch(onRejected);
  }

  finally(onFinally) {
    return this._resolve().finally(onFinally);
  }
}

class SpecialPopulateProxy {
  constructor(resultPromise, builder, mode) {
    this._resultPromise = resultPromise;
    this._builder = builder;
    this._mode = mode;
  }

  populate(path, options) {
    this._builder.populate(path, options);
    return this;
  }

  async _resolve() {
    const result = await Promise.resolve(this._resultPromise);
    const data = Array.isArray(result?.data) ? result.data : [];
    const populated = await this._builder.execute(data);
    return { ...result, data: populated };
  }

  then(onFulfilled, onRejected) {
    return this._resolve().then(onFulfilled, onRejected);
  }

  catch(onRejected) {
    return this._resolve().catch(onRejected);
  }

  finally(onFinally) {
    return this._resolve().finally(onFinally);
  }
}

module.exports = {
  PopulateBuilder,
  PopulateProxy,
  SpecialPopulateProxy,
};
