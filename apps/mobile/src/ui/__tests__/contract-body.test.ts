import { describe, expect, it } from 'vitest';
import { parseContractBody } from '../contract-body';

// Fragment représentatif de ce que `renderStandardBody` produit côté serveur.
const SAMPLE = `
<section class="contract">
  <h1>Contrat de bail à usage d'habitation</h1>
  <p>Entre les soussignés :</p>
  <p><strong>Résidences Obélix</strong>, propriétaire bailleur, d'une part,</p>
  <h2>Article 1 — Objet</h2>
  <p>Le bailleur loue au preneur le logement <strong>A-12</strong> situé à Douala, à usage exclusif d'habitation.</p>
  <p class="sign">Fait en deux exemplaires. Signature électronique du preneur enregistrée par Bailo.</p>
</section>
`;

describe('parseContractBody', () => {
  it('extrait les blocs dans l’ordre avec leur type', () => {
    const blocks = parseContractBody(SAMPLE);
    expect(blocks.map((b) => b.kind)).toEqual(['h1', 'p', 'p', 'h2', 'p', 'sign']);
  });

  it('rogne l’indentation du gabarit sans coller les mots', () => {
    const h1 = parseContractBody(SAMPLE)[0]!;
    expect(h1.spans).toHaveLength(1);
    expect(h1.spans[0]!.text).toBe("Contrat de bail à usage d'habitation");
  });

  it('marque les segments <strong> en gras et garde les espaces autour', () => {
    const objet = parseContractBody(SAMPLE)[4]!; // le <p> de l'article 1
    const bold = objet.spans.find((sp) => sp.bold);
    expect(bold?.text).toBe('A-12');
    // Le texte reconstitué conserve l'espace avant et après le segment gras.
    expect(objet.spans.map((sp) => sp.text).join('')).toContain('logement A-12 situé');
  });

  it('détecte la mention de signature (p.sign)', () => {
    const sign = parseContractBody(SAMPLE).find((b) => b.kind === 'sign');
    expect(sign?.spans[0]?.text).toContain('Fait en deux exemplaires');
  });

  it('décode les entités et convertit <br>', () => {
    const block = parseContractBody('<p>Doe &amp; Fils<br/>2e étage</p>')[0]!;
    expect(block.spans[0]!.text).toBe('Doe & Fils\n2e étage');
  });

  it('ignore les blocs vides et le HTML inconnu', () => {
    expect(parseContractBody('<div>x</div><p>  </p>')).toEqual([]);
  });
});
