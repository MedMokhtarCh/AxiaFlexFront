import React, { useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";

type MenuItem = { id: string; name: string; price: number };
type CartLine = { productId: string; name: string; price: number; quantity: number };

const API_BASE =
  String(process.env.EXPO_PUBLIC_API_BASE_URL || "").trim() ||
  (Platform.OS === "android"
    ? "http://10.0.2.2:3003"
    : "http://localhost:3003");

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [preorders, setPreorders] = useState<any[]>([]);
  const [message, setMessage] = useState("");

  const total = useMemo(
    () => cart.reduce((sum, l) => sum + Number(l.price || 0) * Number(l.quantity || 0), 0),
    [cart],
  );

  const call = async (path: string, init?: RequestInit, authToken?: string) => {
    const headers = {
      ...(init?.headers || {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    } as any;
    const res = await fetch(`${API_BASE}${path}`, { ...(init || {}), headers });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || "Erreur réseau");
    return json;
  };

  const signup = async () => {
    try {
      await call("/pos/preorders/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: name, email, password, phone }),
      });
      setMessage("Compte créé, connecte-toi.");
    } catch (e: any) {
      setMessage(e?.message || "Inscription impossible");
    }
  };

  const signin = async () => {
    try {
      const u = await call("/pos/preorders/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      setUser(u);
      setToken(String(u?.token || ""));
      setMessage("");
      const m = await call("/pos/preorders/menu");
      setMenu(m || []);
      const mine = await call("/pos/preorders", undefined, String(u?.token || ""));
      setPreorders(mine || []);
    } catch (e: any) {
      setMessage(e?.message || "Connexion impossible");
    }
  };

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const idx = prev.findIndex((p) => p.productId === item.id);
      if (idx < 0) return [...prev, { productId: item.id, name: item.name, price: item.price, quantity: 1 }];
      return prev.map((row, i) => (i === idx ? { ...row, quantity: row.quantity + 1 } : row));
    });
  };

  const sendPreorder = async () => {
    try {
      const payload = {
        preorderUserId: user?.id || null,
        customerName: user?.fullName || "Client mobile",
        customerPhone: user?.phone || null,
        mode: "DELIVERY",
        items: cart.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      };
      await call("/pos/preorders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }, token);
      setCart([]);
      const mine = await call("/pos/preorders", undefined, token);
      setPreorders(mine || []);
      setMessage("Précommande envoyée.");
    } catch (e: any) {
      setMessage(e?.message || "Envoi impossible");
    }
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="dark" />
        <View style={styles.card}>
          <Text style={styles.title}>AxiaFlex Mobile</Text>
          <TextInput style={styles.input} placeholder="Nom complet" value={name} onChangeText={setName} />
          <TextInput style={styles.input} placeholder="Téléphone" value={phone} onChangeText={setPhone} />
          <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} />
          <TextInput style={styles.input} placeholder="Mot de passe" secureTextEntry value={password} onChangeText={setPassword} />
          <Pressable style={styles.btnDark} onPress={signup}>
            <Text style={styles.btnText}>Créer un compte</Text>
          </Pressable>
          <Pressable style={styles.btnPrimary} onPress={signin}>
            <Text style={styles.btnText}>Se connecter</Text>
          </Pressable>
          {!!message && <Text style={styles.msg}>{message}</Text>}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Menu</Text>
        {menu.map((item) => (
          <View style={styles.row} key={item.id}>
            <Text style={styles.rowTxt}>{item.name} - {Number(item.price || 0).toFixed(3)} DT</Text>
            <Pressable style={styles.btnMini} onPress={() => addToCart(item)}>
              <Text style={styles.btnText}>Ajouter</Text>
            </Pressable>
          </View>
        ))}

        <Text style={styles.subtitle}>Panier</Text>
        {cart.map((line) => (
          <Text key={line.productId} style={styles.simpleText}>
            - {line.name} x{line.quantity}
          </Text>
        ))}
        <Text style={styles.simpleText}>Total: {total.toFixed(3)} DT</Text>
        <Pressable style={styles.btnPrimary} onPress={sendPreorder}>
          <Text style={styles.btnText}>Passer la précommande</Text>
        </Pressable>

        <Text style={styles.subtitle}>Mes précommandes</Text>
        {preorders.map((p) => (
          <View key={p.id} style={styles.preRow}>
            <Text style={styles.simpleText}>
              {p.code} - {p.status} - {Number(p.total || 0).toFixed(3)} DT
            </Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  container: { padding: 16, gap: 12 },
  card: { margin: 16, borderRadius: 20, backgroundColor: "white", padding: 16, gap: 10 },
  title: { fontSize: 24, fontWeight: "800", color: "#0f172a" },
  subtitle: { marginTop: 8, fontSize: 18, fontWeight: "700", color: "#1e293b" },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "white",
  },
  btnPrimary: { backgroundColor: "#4f46e5", borderRadius: 12, padding: 12, alignItems: "center" },
  btnDark: { backgroundColor: "#0f172a", borderRadius: 12, padding: 12, alignItems: "center" },
  btnMini: { backgroundColor: "#0f172a", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  btnText: { color: "white", fontWeight: "700" },
  msg: { color: "#334155", marginTop: 4 },
  row: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  rowTxt: { flex: 1, color: "#0f172a", fontWeight: "600" },
  simpleText: { color: "#334155" },
  preRow: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 10,
  },
});
