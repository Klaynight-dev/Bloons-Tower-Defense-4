# Bulle Défense

Tower defense original en TypeScript + Svelte 5 (Vite), rendu sur Canvas.

## Lancer

```sh
npm install
npm run dev      # développement : http://localhost:5173
npm run build    # version statique dans dist/ (à servir avec n'importe quel serveur web)
npm run check    # vérification des types (svelte-check)
```

`dist/` utilise des chemins relatifs : il fonctionne servi depuis n'importe quel dossier, mais pas en double-clic (`file://`), que les modules ES interdisent.
Ajouter `?debug` à l'URL expose `window.bd` (moteur, données, état d'interface) pour les tests.

## Contenu
- **22 tours** en 3 familles (tir, zone, soutien), 2 voies de 4 améliorations chacune (une seule voie au-delà du niveau 2), 22 capacités actives.
- **20 types de bulles** : couleurs, fusée, noire, blanche, violette, dorée, zébrée, blindée, fantôme, prisme, céramique, 3 dirigeables et **3 boss** (Colosse, Tempête, Hydre) avec mécaniques propres. Modificateurs camouflée, régénérante, fortifiée.
- **12 cartes** (jusqu'à 3 chemins), **4 difficultés**, **7 modes** (Standard, Apocalypse, Déflation, Demi-argent, Disette, Sans retour, Turbo).
- **Rangs** : l'XP débloque les tours (option pour tout débloquer). **25 succès** avec notifications. Bestiaire, records, médailles, sauvegarde automatique entre les vagues.
- 3 pièges (clous, mine, glu), priorités de ciblage, vitesse x1-x3, enchaînement automatique des vagues.
- Interface plein écran (100vh) qui s'adapte à la fenêtre ; commandes de vague et capacités toujours visibles sous le terrain.

## Raccourcis
`1`-`9`, `0`, `)`, `U I O G H J K L B N V` acheter une tour · Maj+clic poser plusieurs · `,` / `;` améliorer · `Tab` cible · `Suppr` vendre · `Espace` lancer / accélérer · `A Z E R T Y` capacités · `P` / `Échap` pause · clic droit annuler.

## Code
- `src/game/data.ts` : bulles, boss, tours, cartes, modes, vagues, succès
- `src/game/engine.ts` : état de partie, combat, boucle, rendu de la partie, entrées, sauvegarde
- `src/game/render.ts` : sprites pré-rendus, décor, dessin des tours et icônes
- `src/game/ui.svelte.ts` : état réactif partagé entre le moteur et l'interface
- `src/components/` : interface Svelte (boutique, panneau de tour, menus, capacités, boss, notifications)

Ressources (sprites, sons, musique, interface, icônes) : voir [public/assets/CREDITS.md](public/assets/CREDITS.md).
