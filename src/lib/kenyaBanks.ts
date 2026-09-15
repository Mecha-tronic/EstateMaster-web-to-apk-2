export interface KenyanBankInfo {
  id: string;
  name: string;
  shortName: string;
  code: string;
  paybill?: string;
  swiftCode?: string;
  logoColor: string;
  textColor: string;
  popular: boolean;
  supportedMethods: ('EFT' | 'PESALINK' | 'RTGS' | 'PAYBILL')[];
  description: string;
}

export const KENYA_BANKS: KenyanBankInfo[] = [
  {
    id: 'equity',
    name: 'Equity Bank Kenya',
    shortName: 'Equity Bank',
    code: '68',
    paybill: '247247',
    swiftCode: 'EQBLKENA',
    logoColor: 'bg-amber-700',
    textColor: 'text-amber-800',
    popular: true,
    supportedMethods: ['PESALINK', 'EFT', 'RTGS', 'PAYBILL'],
    description: 'Equity Bank EazzyBiz, EazzyPay, and PesaLink Direct Settlement'
  },
  {
    id: 'kcb',
    name: 'KCB Bank Kenya (Kenya Commercial Bank)',
    shortName: 'KCB Bank',
    code: '01',
    paybill: '522522',
    swiftCode: 'KCBLKENA',
    logoColor: 'bg-emerald-600',
    textColor: 'text-emerald-800',
    popular: true,
    supportedMethods: ['PESALINK', 'EFT', 'RTGS', 'PAYBILL'],
    description: 'KCB i-Bank, Vooma, Buni API, and PesaLink Direct Collection'
  },
  {
    id: 'coop',
    name: 'Co-operative Bank of Kenya',
    shortName: 'Co-op Bank',
    code: '11',
    paybill: '400200',
    swiftCode: 'KCOO-KENA',
    logoColor: 'bg-green-700',
    textColor: 'text-green-800',
    popular: true,
    supportedMethods: ['PESALINK', 'EFT', 'RTGS', 'PAYBILL'],
    description: 'Co-op Bank MCo-op Cash, Co-op Connect API, and PesaLink Direct'
  },
  {
    id: 'nbk',
    name: 'National Bank of Kenya (NBK)',
    shortName: 'National Bank',
    code: '12',
    paybill: '625625',
    swiftCode: 'NBKEKENA',
    logoColor: 'bg-yellow-600',
    textColor: 'text-yellow-800',
    popular: true,
    supportedMethods: ['PESALINK', 'EFT', 'RTGS', 'PAYBILL'],
    description: 'National Bank NatConnect, PesaLink, and Branch Direct Wire'
  },
  {
    id: 'ncba',
    name: 'NCBA Bank Kenya',
    shortName: 'NCBA Bank',
    code: '07',
    paybill: '888888',
    swiftCode: 'CBAFKENA',
    logoColor: 'bg-blue-900',
    textColor: 'text-blue-900',
    popular: true,
    supportedMethods: ['PESALINK', 'EFT', 'RTGS', 'PAYBILL'],
    description: 'NCBA Loop, NCBA Online Corporate & PesaLink Direct'
  },
  {
    id: 'absa',
    name: 'Absa Bank Kenya',
    shortName: 'Absa Bank',
    code: '03',
    paybill: '303030',
    swiftCode: 'BARCKENX',
    logoColor: 'bg-rose-700',
    textColor: 'text-rose-800',
    popular: true,
    supportedMethods: ['PESALINK', 'EFT', 'RTGS', 'PAYBILL'],
    description: 'Absa Access, PesaLink & Corporate Multi-currency Collection'
  },
  {
    id: 'stanchart',
    name: 'Standard Chartered Bank Kenya',
    shortName: 'Standard Chartered',
    code: '02',
    paybill: '329329',
    swiftCode: 'SCBLKENX',
    logoColor: 'bg-sky-700',
    textColor: 'text-sky-800',
    popular: false,
    supportedMethods: ['PESALINK', 'EFT', 'RTGS', 'PAYBILL'],
    description: 'Straight2Bank, SC Mobile & PesaLink Direct'
  },
  {
    id: 'dtb',
    name: 'Diamond Trust Bank (DTB Kenya)',
    shortName: 'DTB Bank',
    code: '63',
    paybill: '516600',
    swiftCode: 'DTBLKENA',
    logoColor: 'bg-indigo-700',
    textColor: 'text-indigo-800',
    popular: false,
    supportedMethods: ['PESALINK', 'EFT', 'RTGS', 'PAYBILL'],
    description: 'DTB 24/7 Digital, PesaLink & Paybill'
  },
  {
    id: 'stanbic',
    name: 'Stanbic Bank Kenya',
    shortName: 'Stanbic Bank',
    code: '31',
    paybill: '600100',
    swiftCode: 'SBICKENX',
    logoColor: 'bg-blue-700',
    textColor: 'text-blue-800',
    popular: false,
    supportedMethods: ['PESALINK', 'EFT', 'RTGS', 'PAYBILL'],
    description: 'Enterprise Online, PesaLink & Business Paybill'
  },
  {
    id: 'im',
    name: 'I&M Bank Kenya',
    shortName: 'I&M Bank',
    code: '53',
    paybill: '542542',
    swiftCode: 'IMBLKENA',
    logoColor: 'bg-cyan-700',
    textColor: 'text-cyan-800',
    popular: false,
    supportedMethods: ['PESALINK', 'EFT', 'RTGS', 'PAYBILL'],
    description: 'I&M OTG App, PesaLink & Corporate Clearing'
  },
  {
    id: 'family',
    name: 'Family Bank Kenya',
    shortName: 'Family Bank',
    code: '70',
    paybill: '222111',
    swiftCode: 'FABLKENA',
    logoColor: 'bg-orange-600',
    textColor: 'text-orange-800',
    popular: false,
    supportedMethods: ['PESALINK', 'EFT', 'RTGS', 'PAYBILL'],
    description: 'PesaPap, PesaLink & Direct Merchant Paybill'
  },
  {
    id: 'hf',
    name: 'HF Group (Housing Finance Bank)',
    shortName: 'HF Bank',
    code: '61',
    paybill: '100400',
    swiftCode: 'HFCKKENA',
    logoColor: 'bg-red-700',
    textColor: 'text-red-800',
    popular: false,
    supportedMethods: ['PESALINK', 'EFT', 'RTGS', 'PAYBILL'],
    description: 'HF Whizz & Real Estate Escrow Collections'
  },
  {
    id: 'other',
    name: 'Other Commercial Bank / SACCO / Microfinance',
    shortName: 'Other Kenyan Bank / SACCO',
    code: '99',
    logoColor: 'bg-slate-700',
    textColor: 'text-slate-800',
    popular: false,
    supportedMethods: ['PESALINK', 'EFT', 'RTGS'],
    description: 'Custom Kenyan Bank, Microfinance, or SACCO Account'
  }
];

export function getBankByNameOrId(query: string): KenyanBankInfo | undefined {
  if (!query) return undefined;
  const q = query.toLowerCase().trim();
  return KENYA_BANKS.find(
    b => b.id.toLowerCase() === q ||
         b.name.toLowerCase().includes(q) ||
         b.shortName.toLowerCase().includes(q)
  );
}
