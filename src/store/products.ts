export interface Product {
  id: string;
  name: string;
  price: number;
  tag?: string;
  image: string;
  description: string;
}

/** Fotos Unsplash (calçados / streetwear) — catálogo mockado */
export const PRODUCTS: Product[] = [
  {
    id: "tenis-sond-branco",
    name: "Tênis Sond Original",
    price: 249.9,
    tag: "30% OFF",
    image:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80",
    description: "Couro premium, solado leve e design versátil.",
  },
  {
    id: "tenis-urban-black",
    name: "Tênis Urban Black",
    price: 219.9,
    image:
      "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?auto=format&fit=crop&w=800&q=80",
    description: "Preto fosco para o dia a dia na cidade.",
  },
  {
    id: "slip-on-wood",
    name: "Slip-On Wood Tone",
    price: 179.9,
    tag: "NOVO",
    image:
      "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?auto=format&fit=crop&w=800&q=80",
    description: "Toque amadeirado, conforto o dia todo.",
  },
  {
    id: "sneaker-calango",
    name: "Sneaker Calango Red",
    price: 269.9,
    tag: "EXCLUSIVO",
    image:
      "https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=800&q=80",
    description: "Detalhe vermelho da marca, edição limitada.",
  },
  {
    id: "runner-street",
    name: "Runner Street Wear",
    price: 199.9,
    image:
      "https://images.unsplash.com/photo-1552346154-21d32810aba3?auto=format&fit=crop&w=800&q=80",
    description: "Leveza e resistência para o rolê.",
  },
  {
    id: "court-classic",
    name: "Court Classic",
    price: 189.9,
    image:
      "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=800&q=80",
    description: "Silhueta clássica, visual moderno.",
  },
  {
    id: "high-top-night",
    name: "High-Top Night",
    price: 289.9,
    tag: "NOVO",
    image:
      "https://images.unsplash.com/photo-1600269452121-4f2416e55c28?auto=format&fit=crop&w=800&q=80",
    description: "Cano alto, presença na noite.",
  },
  {
    id: "low-canvas",
    name: "Low Canvas",
    price: 159.9,
    image:
      "https://images.unsplash.com/photo-1460353581641-37baddab0fa2?auto=format&fit=crop&w=800&q=80",
    description: "Canvas respirável, essencial do guarda-roupa.",
  },
];
