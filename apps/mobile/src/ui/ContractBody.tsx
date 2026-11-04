import { StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';
import { parseContractBody, type ContractBlock } from './contract-body';

/** Affiche le corps HTML d'un contrat en texte natif lisible (voir `parseContractBody`). */
export function ContractBody({ html }: { html: string }) {
  const blocks = parseContractBody(html);
  if (blocks.length === 0) {
    return <Text style={cb.empty}>Le corps du contrat est vide.</Text>;
  }
  return (
    <View style={cb.body}>
      {blocks.map((block, i) => (
        <BlockText key={i} block={block} />
      ))}
    </View>
  );
}

function BlockText({ block }: { block: ContractBlock }) {
  const style =
    block.kind === 'h1'
      ? cb.h1
      : block.kind === 'h2'
        ? cb.h2
        : block.kind === 'h3'
          ? cb.h3
          : block.kind === 'sign'
            ? cb.sign
            : cb.p;
  return (
    <Text style={style}>
      {block.spans.map((span, i) => (
        <Text
          key={i}
          style={[
            span.bold ? cb.bold : null,
            span.italic ? cb.italic : null,
          ]}
        >
          {span.text}
        </Text>
      ))}
    </Text>
  );
}

const cb = StyleSheet.create({
  body: { gap: 10 },
  h1: { fontSize: 18, fontWeight: '700', color: colors.brand, marginBottom: 2 },
  h2: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 6 },
  h3: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 4 },
  p: { fontSize: 14, color: colors.text, lineHeight: 21 },
  sign: { fontSize: 13, fontStyle: 'italic', color: colors.textSecondary, marginTop: 12 },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  empty: { fontSize: 14, color: colors.textSecondary },
});
