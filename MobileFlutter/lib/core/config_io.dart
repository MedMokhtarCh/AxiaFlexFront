import "dart:io" show Platform;

/// Port API par défaut (équipe / `.env` : souvent 3003).
const int kDefaultApiPort = 3003;

String defaultPlatformBaseUrl() {
  if (Platform.isAndroid) {
    return "http://10.0.2.2:$kDefaultApiPort";
  }
  if (Platform.isIOS) {
    return "http://127.0.0.1:$kDefaultApiPort";
  }
  return "http://localhost:$kDefaultApiPort";
}
