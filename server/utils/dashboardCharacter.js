const { defaults, choices, ranges } = require('../../shared/dashboard-character.json');

function validateCharacterSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'Choose valid character settings.' };
  }
  const settings = { ...defaults };
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(defaults, key)) return { error: 'An unsupported character setting was provided.' };
    if (Object.hasOwn(choices, key)) {
      if (!choices[key].includes(value)) return { error: `Choose a valid ${key} option.` };
    } else if (Object.hasOwn(ranges, key)) {
      if (!Number.isInteger(value) || value < ranges[key].min || value > ranges[key].max) {
        return { error: `The ${key} setting is outside its allowed range.` };
      }
    } else if (typeof defaults[key] === 'boolean') {
      if (typeof value !== 'boolean') return { error: `Choose a valid ${key} option.` };
    } else if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) {
      return { error: 'Use a valid six-digit color code.' };
    }
    settings[key] = value;
  }
  return { settings };
}

module.exports = { defaults, validateCharacterSettings };
