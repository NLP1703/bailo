# Notifications push — activation (ta part)

Le code est **entièrement câblé** des deux côtés :

- **Serveur** (déployé) : enregistre le jeton push de l'appareil (`device.pushToken`),
  cible par rôle et envoie via le service push Expo (remise de caisse à confirmer, panne
  urgente…). Testé par e2e.
- **Mobile** (build natif compilé) : [`src/lib/push.ts`](../src/lib/push.ts) demande la
  permission, crée le canal Android et récupère le **jeton Expo**, puis
  [`src/sync/engine.ts`](../src/sync/engine.ts) l'envoie au serveur à l'enregistrement de
  l'appareil. Tout est best-effort : sans configuration, `getPushToken()` renvoie `null`
  et l'app fonctionne normalement (le push est un confort, NFM5).

Il reste trois choses qui **exigent tes comptes** (Google/Firebase et Expo) — elles ne
peuvent pas être faites à ta place, mais c'est une configuration ponctuelle (~20 min).

## 1 · Projet Expo (EAS) → `projectId`

Sans `projectId`, l'app ne peut pas obtenir de jeton Expo (`getExpoPushTokenAsync`).

```bash
cd apps/mobile
npx eas-cli login          # ton compte Expo (en créer un gratuitement si besoin)
npx eas-cli init           # crée le projet EAS et écrit extra.eas.projectId dans app.json
```

Vérifie qu'`app.json` contient maintenant :

```json
"extra": { "eas": { "projectId": "xxxxxxxx-xxxx-..." }, "apiUrl": "…" }
```

## 2 · Firebase → `google-services.json`

1. https://console.firebase.google.com → **Ajouter un projet** (nom : `Bailo`).
2. **Ajouter une application → Android**, nom de package **`cm.bailo.app`**
   (exactement celui d'`app.json`).
3. Télécharger **`google-services.json`**, le placer dans `apps/mobile/` et l'indiquer
   dans `app.json` :

   ```json
   "android": { "package": "cm.bailo.app", "googleServicesFile": "./google-services.json", … }
   ```

## 3 · Donner à Expo la clé FCM v1

Pour qu'Expo puisse livrer sur Android, il lui faut la clé de service FCM :

1. Firebase → ⚙️ **Paramètres du projet → Comptes de service → Générer une nouvelle clé
   privée** → télécharge le JSON.
2. Dépose-la sur Expo :

   ```bash
   cd apps/mobile
   npx eas-cli credentials        # Android → Push Notifications: FCM V1 → charger le JSON
   ```

## 4 · Recompiler pour embarquer `google-services.json`

```bash
pnpm --filter @bailo/mobile android      # dev build
# ou un build autonome :
cd apps/mobile/android && ./gradlew assembleRelease
```

## 5 · Vérifier

1. Lance l'app, connecte-toi (l'enregistrement de l'appareil envoie le jeton au serveur).
2. Dans les logs Metro, `getPushToken()` doit renvoyer un `ExponentPushToken[…]`.
3. Test d'envoi : https://expo.dev/notifications → colle le jeton → envoie. La notification
   doit arriver sur l'appareil.
4. Déclencheur réel : crée une remise de caisse côté gardien → le propriétaire reçoit la
   notification « remise à confirmer ».

> Tant que ces étapes ne sont pas faites, le serveur accepte et stocke les jetons mais
> aucun appareil n'en fournit : tout le reste de l'app marche, seule la livraison des
> notifications est en attente.
