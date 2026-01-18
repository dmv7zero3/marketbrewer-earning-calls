// MENTION Rules Sidebar Component
// Display Kalshi MENTION contract rules for reference

export function MentionRules() {
  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-white mb-4">MENTION Rules</h2>
      <div className="text-xs text-slate-400 space-y-2">
        <RuleItem included label="Plurals & possessives" />
        <RuleItem included label="Hyphenated compounds" />
        <RuleItem included label="Homonyms & homographs" />
        <RuleItem included={false} label="Grammatical inflections" />
        <RuleItem included={false} label="Closed compounds" />
        <RuleItem included={false} label="Other languages" />
      </div>
    </div>
  );
}

interface RuleItemProps {
  included: boolean;
  label: string;
}

function RuleItem({ included, label }: RuleItemProps) {
  return (
    <p>
      <span className={included ? 'text-profit-500' : 'text-loss-500'}>
        {included ? '✓' : '✗'}
      </span>{' '}
      {label}
    </p>
  );
}
