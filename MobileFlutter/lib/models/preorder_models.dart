class MobileUser {
  final String id;
  final String email;
  final String fullName;
  final String? phone;
  final String token;

  MobileUser({
    required this.id,
    required this.email,
    required this.fullName,
    required this.token,
    this.phone,
  });

  factory MobileUser.fromJson(Map<String, dynamic> json) {
    return MobileUser(
      id: "${json["id"] ?? ""}",
      email: "${json["email"] ?? ""}",
      fullName: "${json["fullName"] ?? ""}",
      phone: json["phone"] == null ? null : "${json["phone"]}",
      token: "${json["token"] ?? ""}",
    );
  }
}

class MenuItemDto {
  final String id;
  final String name;
  final double price;

  MenuItemDto({required this.id, required this.name, required this.price});

  factory MenuItemDto.fromJson(Map<String, dynamic> json) {
    return MenuItemDto(
      id: "${json["id"] ?? ""}",
      name: "${json["name"] ?? ""}",
      price: (json["price"] as num?)?.toDouble() ?? 0,
    );
  }
}

class PreorderDto {
  final String id;
  final String code;
  final String status;
  final double total;

  PreorderDto({
    required this.id,
    required this.code,
    required this.status,
    required this.total,
  });

  factory PreorderDto.fromJson(Map<String, dynamic> json) {
    return PreorderDto(
      id: "${json["id"] ?? ""}",
      code: "${json["code"] ?? ""}",
      status: "${json["status"] ?? ""}",
      total: (json["total"] as num?)?.toDouble() ?? 0,
    );
  }
}

class CartLine {
  final MenuItemDto item;
  int quantity;

  CartLine({required this.item, required this.quantity});
}
