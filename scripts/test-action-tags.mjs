// Standalone, dependency-free mirror of the ai edge function's tag-extraction
// logic (functions/ai/index.ts, deployed via the Supabase MCP tool, is not
// tracked in this repo). Run with `node scripts/test-action-tags.mjs` before
// changing extractActions/safeSplit/ACTION_TAGS in that function — this is
// exactly the kind of regex surface a plausible-looking edit quietly breaks.

// Mirrors the edge function's extraction logic exactly, to test it without
// a live deploy round trip.
const ACTION_TAGS = {
  remember: 'block',
  setting: 'self',
  'note-create': 'block',
  'note-delete': 'self',
  'weather-set': 'self',
  'message-send': 'block',
  'reminder-create': 'block',
  'reminder-delete': 'self'
};

function parseAttrs(raw) {
  const attrs = {};
  const re = /([\w-]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(raw))) attrs[m[1]] = m[2];
  return attrs;
}

function extractMemories(reply) {
  const facts = [];
  const clean = reply
    .replace(/<remember>([\s\S]*?)<\/remember>/gi, (_m, b) => {
      const fact = b.trim();
      if (fact && fact.length <= 240) facts.push(fact);
      return '';
    })
    .replace(/<\/?remember>[\s\S]*$/i, '')
    .trim();
  return { clean, facts: facts.slice(0, 2) };
}

function extractActions(text) {
  const actions = [];
  let clean = text;
  for (const [name, shape] of Object.entries(ACTION_TAGS)) {
    if (name === 'remember') continue;
    if (shape === 'self') {
      const re = new RegExp(`<${name}((?:\\s+[\\w-]+="[^"]*")*)\\s*/>`, 'g');
      clean = clean.replace(re, (_m, attrRaw) => {
        actions.push({ name, attrs: parseAttrs(attrRaw), content: '' });
        return '';
      });
    } else {
      const re = new RegExp(`<${name}((?:\\s+[\\w-]+="[^"]*")*)\\s*>([\\s\\S]*?)</${name}>`, 'g');
      clean = clean.replace(re, (_m, attrRaw, content) => {
        actions.push({ name, attrs: parseAttrs(attrRaw), content: content.trim() });
        return '';
      });
    }
  }
  // two adjacent removed tags each leave their own space behind
  clean = clean.replace(/ {2,}/g, ' ');
  return { clean: clean.trim(), actions: actions.slice(0, 6) };
}

const TAG_NAMES = Object.keys(ACTION_TAGS);
function safeSplit(pending) {
  const idx = pending.indexOf('<');
  if (idx === -1) return { emit: pending, hold: '' };
  const tail = pending.slice(idx);
  const looksLikeTag = TAG_NAMES.some((name) => {
    const open = `<${name}`;
    return tail.startsWith(open) || open.startsWith(tail);
  });
  if (looksLikeTag) return { emit: pending.slice(0, idx), hold: tail };
  const rest = safeSplit(pending.slice(idx + 1));
  return { emit: pending.slice(0, idx + 1) + rest.emit, hold: rest.hold };
}

let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures++;
    console.log(`FAIL ${label}\n  got:      ${a}\n  expected: ${e}`);
  } else {
    console.log(`ok   ${label}`);
  }
}

// 1. settings, multi-attr self-closing
{
  const input = 'Done — turned it down.\n<setting key="soundVolume" value="0.3"/>';
  const { clean: afterMem } = extractMemories(input);
  const { clean, actions } = extractActions(afterMem);
  check('setting tag stripped', clean, 'Done — turned it down.');
  check('setting attrs parsed', actions, [
    { name: 'setting', attrs: { key: 'soundVolume', value: '0.3' }, content: '' }
  ]);
}

// 2. note-create block with multi-line content, no attrs
{
  const input = 'Saved.\n<note-create>Grocery list\nmilk, eggs, bread</note-create>';
  const { clean, actions } = extractActions(extractMemories(input).clean);
  check('note-create clean', clean, 'Saved.');
  check('note-create content preserved with newline', actions[0].content, 'Grocery list\nmilk, eggs, bread');
}

// 3. reminder-create with an attr AND block content together
{
  const input = '<reminder-create at="2026-08-30T21:15:00.000Z">check the oven</reminder-create>ok';
  const { actions, clean } = extractActions(extractMemories(input).clean);
  check('reminder-create attrs', actions[0].attrs, { at: '2026-08-30T21:15:00.000Z' });
  check('reminder-create content', actions[0].content, 'check the oven');
  check('reminder-create surrounding text kept', clean, 'ok');
}

// 4. remember + action together, remember must not appear in actions
{
  const input =
    'Got it.\n<remember>Prefers 24 hour clock.</remember>\n<setting key="use24hClock" value="true"/>';
  const { clean: afterMem, facts } = extractMemories(input);
  const { clean, actions } = extractActions(afterMem);
  check('remember extracted as fact', facts, ['Prefers 24 hour clock.']);
  check('remember tag gone from clean', clean.includes('remember'), false);
  check('setting action still found after remember strip', actions.length, 1);
  check('final clean text', clean, 'Got it.');
}

// 5. unrecognized tag name must survive untouched (closed vocabulary)
{
  const input = 'nope <delete-user id="x"/> not a real action';
  const { clean, actions } = extractActions(extractMemories(input).clean);
  check('unknown tag left as literal text', clean, input);
  check('unknown tag produces zero actions', actions.length, 0);
}

// 6. two actions of different kinds in one reply
{
  const input =
    '<note-delete id="abc-123"/> and <message-send thread="Groceries">pick up milk</message-send> done';
  const { actions, clean } = extractActions(extractMemories(input).clean);
  check('two actions found', actions.length, 2);
  check('note-delete id', actions[0].attrs.id, 'abc-123');
  check('message-send thread attr', actions[1].attrs.thread, 'Groceries');
  check('message-send content', actions[1].content, 'pick up milk');
  check('surrounding prose kept', clean, 'and done');
}

// 7. streaming hold-back: a tag split across two chunks must never leak raw markup
{
  let hold = '';
  const chunks = ['Sure, ', '<setti', 'ng key="graphics" ', 'value="1"/>', ' done.'];
  let emitted = '';
  for (const c of chunks) {
    const { emit, hold: keep } = safeSplit(hold + c);
    hold = keep;
    emitted += emit;
  }
  check('mid-stream emitted text has no raw tag markup', emitted.includes('<'), false);
  check('mid-stream emitted text is exactly the prose so far', emitted, 'Sure, ');
}

// 8. a bare '<' in genuine prose (not a recognized tag) must not get stuck forever
{
  let hold = '';
  const chunks = ['is 5 ', '< 10, ', 'yes'];
  let emitted = '';
  for (const c of chunks) {
    const { emit, hold: keep } = safeSplit(hold + c);
    hold = keep;
    emitted += emit;
  }
  emitted += hold; // flush whatever's left, as the real code does via `full` at stream end
  check('genuine "<" in prose reaches the reader', emitted, 'is 5 < 10, yes');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
