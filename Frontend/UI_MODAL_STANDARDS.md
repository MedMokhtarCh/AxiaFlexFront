# Charte UI Modales (POS)

Ce document définit le standard visuel des modales dans le frontend POS.

## Objectif

- Garder une UI homogène sur tous les écrans de gestion.
- Optimiser la lisibilité et l'usage tactile (tablettes/écrans POS).
- Eviter la multiplication de styles inline divergents.

## Classes CSS standard

Utiliser les classes globales définies dans `Frontend/styles.css` :

- `app-modal-header`
  - Structure de header de modale (titre + bouton fermer).
  - Fond gradient léger + bordure basse.

- `app-modal-footer`
  - Zone d'actions en bas de modale (annuler / valider).
  - Fond neutre + bordure haute.

- `app-modal-title`
  - Titre principal de modale.

- `app-modal-title-sm`
  - Titre compact (sous-modales, modales secondaires).

- `app-modal-close`
  - Bouton fermeture (X), taille uniforme.

- `app-modal-btn`
  - Base de bouton de modale (taille tactile).

- `app-modal-btn-primary`
  - Action principale (enregistrer, confirmer).

- `app-modal-btn-secondary`
  - Action secondaire (annuler, retour).

- `app-modal-btn-danger`
  - Action destructive (supprimer).

## Règles d'implémentation

- Header
  - Toujours `app-modal-header`.
  - Titre avec `app-modal-title` (ou `app-modal-title-sm` si nécessaire).
  - Bouton fermer avec `app-modal-close`.

- Footer
  - Toujours `app-modal-footer`.
  - Ordre des actions :
    1. Secondaire (Annuler)
    2. Primaire (Enregistrer / Valider)
  - En action destructive, utiliser `app-modal-btn-danger`.

- Boutons
  - Eviter les boutons texte seuls (ex: `hover:underline`) dans les modales.
  - Préférer les boutons pleins/bordés avec tailles tactiles.

- Accessibilité
  - Garder des labels explicites : `Annuler`, `Enregistrer`, `Supprimer`.
  - Ne pas utiliser seulement la couleur pour signifier l'action.

## Exemple recommandé

```tsx
<div className="app-modal-header">
  <h3 className="app-modal-title">Modifier l'article</h3>
  <button className="app-modal-close" onClick={onClose}>X</button>
</div>

<div className="...">...</div>

<div className="app-modal-footer">
  <button className="app-modal-btn app-modal-btn-secondary" onClick={onClose}>
    Annuler
  </button>
  <button className="app-modal-btn app-modal-btn-primary" onClick={onSave}>
    Enregistrer
  </button>
</div>
```

## Portée actuelle

Standard déjà appliqué sur :

- `ProductManagement`
- `PromotionManagement`
- `CategoryManagement`
- `PurchaseManagement`
- `StockManagement`

Pour tout nouveau composant de gestion, suivre cette charte.
