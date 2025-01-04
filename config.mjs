import log from './log.mjs';


class Config {

  constructor({ options = {}, env = process.env }) {
    this.options = options;
    this.env = env;
    this.descriptions = {};
    this.names = [];
    this.envNames = {};
    this.optionValues = {};
    this.envValues = {};
    this.defaultValues = {};
    this.types = {};
    this.groups = {};
    this.maybeSetup();
  }

  maybeSetup() {
    if(this.setup !== undefined) {
      this.setup();
    }
  }

  option(
    name,
    _default,
    description = 'no description',
    type = 'string',
    group
  ) {
    const envName =
      name
      .replace(/\W+/g, '_')
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .toUpperCase();
    const optionValue = this.options?.[name];
    const envValue = this.env[envName];
    this.names.push(name);
    this.envNames[name] = envName;
    this.envValues[name] = envValue;
    this.defaultValues[name] = _default;
    this.optionValues[name] = optionValue;
    this.groups[name] = group;
    this[name] =
      optionValue
      ?? envValue
      ?? _default;
    this.descriptions[name] = description;
    this.types[name] = type;
    log.debug({
      name,
      envName,
      optionValue,
      envValue,
      default: _default,
      description,
      type,
      group,
      value: this[name],
    });
  }

  _update(name, value, group) {
    const groups = this.groups;
    if (!this.names.includes(name)) {
      throw new Error(`Unknown option ${name}`);
    }
    if(group && groups[name] !== group) {
      throw new Error(`Option ${name} is not in group ${group}`);
    }
    this[name] = value;
  }

  update(options, group) {
    const names = Object.keys(options);
    for(const name of names) {
      const value = options[name];
      this._update(
        name,
        value,
        group
      );
    }
    this.maybePostUpdate();
  }

  maybePostUpdate() {
    if(this.postUpdate !== undefined) {
      this.postUpdate();
    }
  }

  getGroup(group) {
    let names = this.names;
    const groups = this.groups;
    names = names.filter(m => groups[m] === group);
    const result = {};
    for(const name of names) {
      result[name] = this[name];
    }
    return result;
  }
};


export default Config
