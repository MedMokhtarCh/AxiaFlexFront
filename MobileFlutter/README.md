# AxiaFlex Mobile Flutter

Version Flutter de l'application mobile precommandes.

## Prerequis

- Flutter SDK installe et ajoute au PATH
- Android SDK + emulator + adb

## Generer les dossiers natifs (android/ios)

Dans `MobileFlutter`:

```bash
flutter create .
```

## Installer les dependances

```bash
flutter pub get
```

## Lancer sur emulateur Android

```bash
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3003
```

## Lancer sur web

```bash
flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:3003
```

## APIs utilisees

- `POST /pos/preorders/auth/signup`
- `POST /pos/preorders/auth/signin`
- `GET /pos/preorders/menu`
- `GET /pos/preorders` (Bearer token)
- `POST /pos/preorders` (Bearer token)
