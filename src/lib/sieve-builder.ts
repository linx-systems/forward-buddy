export interface FilterCondition {
  header: string;
  operator: string;
  value: string;
}

export interface FilterRule {
  conditions: FilterCondition[];
  conditionLogic: 'allof' | 'anyof';
  action: 'fileinto' | 'reject' | 'flag' | 'redirect' | 'discard';
  actionValue?: string;
}

function escapeSieveString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function operatorToSieve(op: string): string {
  switch (op) {
    case 'contains': return ':contains';
    case 'is': return ':is';
    case 'matches': return ':matches';
    case 'regex': return ':regex';
    default: return ':contains';
  }
}

export function buildSieveScript(rule: FilterRule): string {
  const requires = new Set<string>();

  if (rule.action === 'fileinto') requires.add('fileinto');
  if (rule.action === 'flag') requires.add('imap4flags');
  for (const c of rule.conditions) {
    if (c.operator === 'regex') requires.add('regex');
  }

  const lines: string[] = [];

  for (const req of requires) {
    lines.push(`require "${req}";`);
  }
  if (lines.length > 0) lines.push('');

  const tests = rule.conditions.map((c) => {
    const sieveOp = operatorToSieve(c.operator);
    const val = escapeSieveString(c.value);
    return `header ${sieveOp} "${escapeSieveString(c.header)}" "${val}"`;
  });

  let condition: string;
  if (tests.length === 0) {
    condition = 'true';
  } else if (tests.length === 1) {
    condition = tests[0];
  } else {
    condition = `${rule.conditionLogic} (${tests.join(', ')})`;
  }

  lines.push(`if ${condition} {`);

  switch (rule.action) {
    case 'fileinto':
      lines.push(`  fileinto "${escapeSieveString(rule.actionValue || 'INBOX')}";`);
      break;
    case 'reject':
      lines.push(`  reject "${escapeSieveString(rule.actionValue || '')}";`);
      break;
    case 'flag':
      lines.push('  addflag "\\\\Flagged";');
      break;
    case 'redirect':
      lines.push(`  redirect "${escapeSieveString(rule.actionValue || '')}";`);
      break;
    case 'discard':
      lines.push('  discard;');
      break;
  }

  lines.push('}');

  return lines.join('\n');
}
