# Checklist PR - Modales UI (POS)

Utiliser cette checklist avant de merger une PR qui ajoute ou modifie une modale.

## Structure

- [ ] Header en `app-modal-header`
- [ ] Titre en `app-modal-title` (ou `app-modal-title-sm` si modale compacte)
- [ ] Bouton fermeture en `app-modal-close`
- [ ] Footer en `app-modal-footer`

## Boutons d'actions

- [ ] Boutons basés sur `app-modal-btn`
- [ ] Action secondaire en `app-modal-btn-secondary`
- [ ] Action principale en `app-modal-btn-primary`
- [ ] Action destructive en `app-modal-btn-danger` (si suppression)
- [ ] Ordre des boutons respecté: `Annuler` puis `Valider`

## Cohérence UX tactile

- [ ] Taille des boutons suffisante pour usage tactile
- [ ] Labels explicites (`Annuler`, `Enregistrer`, `Supprimer`, etc.)
- [ ] Pas de boutons texte seuls (`hover:underline`) dans le footer de modale

## Validation technique

- [ ] `npm run build` frontend passe
- [ ] Pas d'erreur lint sur les fichiers touchés
- [ ] Pas de régression visuelle évidente sur desktop + écran tactile

## Référence

- Standard complet: `Frontend/UI_MODAL_STANDARDS.md`
