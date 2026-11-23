// The list a brand-new install starts with. After that the list is ordinary
// data: edit it in the app and sync carries it to your other devices. Changing
// this file only affects new installs.
export function starterLists() {
  const questions = [
    { id: 'max', text: 'Bringing Max?', short: 'Max', askIf: [] },
    { id: 'harrison', text: 'Going to Harrison?', short: 'Harrison', askIf: [] },
    { id: 'camping', text: 'Camping?', short: 'Camping', askIf: [] },
    { id: 'fly', text: 'Flying?', short: 'Flying', askIf: [] },
    { id: 'swim', text: 'Swimming?', short: 'Swimming', askIf: ['auto:summer', 'fly'] },
  ]
  // Ids come from the text so they stay put when this list changes.
  const t = (category, group, text, when = [], extra = {}) => ({
    id: `s-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    category, group, text, when, requires: null, perDay: false, ...extra,
  })
  const pack = (group, text, when, extra) => t('pack', group, text, when, extra)
  const max = { requires: 'max' }
  const perDay = { perDay: true }
  const templates = [
    pack('Main', 'Underwear', [], perDay),
    pack('Main', 'Socks', [], perDay),
    pack('Main', 'T-shirts', [], perDay),
    pack('Main', 'Shorts'),
    pack('Main', 'Sweatpants'),
    pack('Main', 'Sweatshirt'),
    pack('Main', 'Collar shirt'),
    pack('Main', 'Rain coat'),
    pack('Main', 'Sliders'),
    pack('Main', 'Bathing suit', ['swim']),

    pack('Main', 'Pills / Ambien'),
    pack('Main', 'Creatine'),
    pack('Main', 'Shots', ['auto:long']),
    pack('Main', 'Toothbrush & toothpaste'),

    pack('Main', 'Phone charger'),
    pack('Main', 'Headphones'),
    pack('Main', 'Laptop / case'),

    ...["Max's pants / shorts", "Max's shirts", "Max's underwear", "Max's socks"]
      .map((text) => pack('Max', text, [], { ...max, ...perDay })),
    ...["Max's pajamas", "Max's toothbrush", "Max's iPad", "Max's iPad charger"]
      .map((text) => pack('Max', text, [], max)),
    pack('Max', "Max's Crocs", [], max),
    pack('Max', "Max's bathing suit", ['swim', 'harrison'], max),

    ...['Sleeping bag', 'Sleeping pad', 'Tent', 'Pillow', 'Hiking boots', 'Teva shoes',
      'Headlamp', 'Flashlight', 'Knife', 'TP', 'Chair', 'Food', 'Electrolytes', 'Cup', 'Spoon',
      'Camelback', 'Bug spray',
    ].map((text) => pack('Camping', text, ['camping'])),
    pack('Camping', 'Hiking socks', ['camping'], perDay),

    pack('Main', 'Goggles', ['swim']),
    // Keeps the id from when it was "baseball glove" so trip check marks survive.
    pack('Max', "Max's baseball mitt", ['harrison'], { ...max, id: 's-max-s-baseball-glove' }),
    pack('Max', "Max's football gloves", ['harrison'], max),

    pack('Main', 'Passports', ['fly']),
    pack('Main', 'Sunglasses', ['fly']),

    t('door', null, 'Turn off HVAC'),
    t('door', null, 'Turn off recirc pump'),
    t('door', null, 'Take out the trash'),
    t('door', null, 'Feed fish'),
    t('door', null, "Plato's food"),
    t('door', null, 'Set Chiller (Fish)', ['auto:summer']),
    t('door', null, 'Replace Filter Socks'),
    t('home', null, 'Turn the HVAC back on'),
    t('home', null, 'Turn the recirc pump back on'),
  ]
  return { questions, templates }
}
