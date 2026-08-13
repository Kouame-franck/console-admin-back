export const STATUS_TO_DB = { actif: "actif", "en attente": "en_attente", suspendu: "suspendu" };
export const STATUS_TO_API = { actif: "actif", en_attente: "en attente", suspendu: "suspendu" };

export const PAYMENT_METHOD_TO_DB = {
  "Mobile Money": "mobile_money",
  "Virement bancaire": "virement",
  "Chèque": "cheque",
  "Espèces": "especes",
};
export const PAYMENT_METHOD_TO_API = {
  mobile_money: "Mobile Money",
  virement: "Virement bancaire",
  cheque: "Chèque",
  especes: "Espèces",
};

export const PAYMENT_STATUS_TO_DB = { "payé": "paye", partiel: "partiel", "en retard": "en_retard" };
export const PAYMENT_STATUS_TO_API = { paye: "payé", partiel: "partiel", en_retard: "en retard" };
