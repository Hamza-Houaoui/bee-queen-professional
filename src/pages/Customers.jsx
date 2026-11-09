import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, generateId } from '../db';
import { SyncEngine } from '../SyncEngine';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { useLocation, useNavigate } from 'react-router-dom';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { Search, Plus, Trash2, Edit2, Users, Camera, X, FileSpreadsheet, ShoppingBag, Wallet, Filter, Download, FileText } from 'lucide-react';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Accounting } from '../utils/accounting';
import { smartSearch } from '../utils/search';
import { Capacitor } from '@capacitor/core';
import * as XLSX from 'xlsx';

const CODES = [
  { prefix: '+93', flag: '🇦🇫', name: 'Afghanistan' },
  { prefix: '+355', flag: '🇦🇱', name: 'Albania' },
  { prefix: '+213', flag: '🇩🇿', name: 'Algeria' },
  { prefix: '+376', flag: '🇦🇩', name: 'Andorra' },
  { prefix: '+244', flag: '🇦🇴', name: 'Angola' },
  { prefix: '+1-268', flag: '🇦🇬', name: 'Antigua and Barbuda' },
  { prefix: '+54', flag: '🇦🇷', name: 'Argentina' },
  { prefix: '+374', flag: '🇦🇲', name: 'Armenia' },
  { prefix: '+61', flag: '🇦🇺', name: 'Australia' },
  { prefix: '+43', flag: '🇦🇹', name: 'Austria' },
  { prefix: '+994', flag: '🇦🇿', name: 'Azerbaijan' },
  { prefix: '+1-242', flag: '🇧🇸', name: 'Bahamas' },
  { prefix: '+973', flag: '🇧🇭', name: 'Bahrain' },
  { prefix: '+880', flag: '🇧🇩', name: 'Bangladesh' },
  { prefix: '+1-246', flag: '🇧🇧', name: 'Barbados' },
  { prefix: '+375', flag: '🇧🇾', name: 'Belarus' },
  { prefix: '+32', flag: '🇧🇪', name: 'Belgium' },
  { prefix: '+501', flag: '🇧🇿', name: 'Belize' },
  { prefix: '+229', flag: '🇧🇯', name: 'Benin' },
  { prefix: '+975', flag: '🇧🇹', name: 'Bhutan' },
  { prefix: '+591', flag: '🇧🇴', name: 'Bolivia' },
  { prefix: '+387', flag: '🇧🇦', name: 'Bosnia and Herzegovina' },
  { prefix: '+267', flag: '🇧🇼', name: 'Botswana' },
  { prefix: '+55', flag: '🇧🇷', name: 'Brazil' },
  { prefix: '+673', flag: '🇧🇳', name: 'Brunei' },
  { prefix: '+359', flag: '🇧🇬', name: 'Bulgaria' },
  { prefix: '+226', flag: '🇧🇫', name: 'Burkina Faso' },
  { prefix: '+257', flag: '🇧🇮', name: 'Burundi' },
  { prefix: '+238', flag: '🇨🇻', name: 'Cabo Verde' },
  { prefix: '+855', flag: '🇰🇭', name: 'Cambodia' },
  { prefix: '+237', flag: '🇨🇲', name: 'Cameroon' },
  { prefix: '+1', flag: '🇨🇦', name: 'Canada' },
  { prefix: '+236', flag: '🇨🇫', name: 'Central African Republic' },
  { prefix: '+235', flag: '🇹🇩', name: 'Chad' },
  { prefix: '+56', flag: '🇨🇱', name: 'Chile' },
  { prefix: '+86', flag: '🇨🇳', name: 'China' },
  { prefix: '+57', flag: '🇨🇴', name: 'Colombia' },
  { prefix: '+269', flag: '🇰🇲', name: 'Comoros' },
  { prefix: '+242', flag: '🇨🇬', name: 'Congo (Congo-Brazzaville)' },
  { prefix: '+243', flag: '🇨🇩', name: 'Congo (Democratic Republic of the)' },
  { prefix: '+506', flag: '🇨🇷', name: 'Costa Rica' },
  { prefix: '+385', flag: '🇭🇷', name: 'Croatia' },
  { prefix: '+53', flag: '🇨🇺', name: 'Cuba' },
  { prefix: '+357', flag: '🇨🇾', name: 'Cyprus' },
  { prefix: '+420', flag: '🇨🇿', name: 'Czechia' },
  { prefix: '+45', flag: '🇩🇰', name: 'Denmark' },
  { prefix: '+253', flag: '🇩🇯', name: 'Djibouti' },
  { prefix: '+1-767', flag: '🇩🇲', name: 'Dominica' },
  { prefix: '+1-809', flag: '🇩🇴', name: 'Dominican Republic' },
  { prefix: '+593', flag: '🇪🇨', name: 'Ecuador' },
  { prefix: '+20', flag: '🇪🇬', name: 'Egypt' },
  { prefix: '+503', flag: '🇸🇻', name: 'El Salvador' },
  { prefix: '+240', flag: '🇬🇶', name: 'Equatorial Guinea' },
  { prefix: '+291', flag: '🇪🇷', name: 'Eritrea' },
  { prefix: '+372', flag: '🇪🇪', name: 'Estonia' },
  { prefix: '+268', flag: '🇸🇿', name: 'Eswatini' },
  { prefix: '+251', flag: '🇪🇹', name: 'Ethiopia' },
  { prefix: '+679', flag: '🇫🇯', name: 'Fiji' },
  { prefix: '+358', flag: '🇫🇮', name: 'Finland' },
  { prefix: '+33', flag: '🇫🇷', name: 'France' },
  { prefix: '+241', flag: '🇬🇦', name: 'Gabon' },
  { prefix: '+220', flag: '🇬🇲', name: 'Gambia' },
  { prefix: '+995', flag: '🇬🇪', name: 'Georgia' },
  { prefix: '+49', flag: '🇩🇪', name: 'Germany' },
  { prefix: '+233', flag: '🇬🇭', name: 'Ghana' },
  { prefix: '+30', flag: '🇬🇷', name: 'Greece' },
  { prefix: '+1-473', flag: '🇬🇩', name: 'Grenada' },
  { prefix: '+502', flag: '🇬🇹', name: 'Guatemala' },
  { prefix: '+224', flag: '🇬🇳', name: 'Guinea' },
  { prefix: '+245', flag: '🇬🇼', name: 'Guinea-Bissau' },
  { prefix: '+592', flag: '🇬🇾', name: 'Guyana' },
  { prefix: '+509', flag: '🇭🇹', name: 'Haiti' },
  { prefix: '+504', flag: '🇭🇳', name: 'Honduras' },
  { prefix: '+36', flag: '🇭🇺', name: 'Hungary' },
  { prefix: '+354', flag: '🇮🇸', name: 'Iceland' },
  { prefix: '+91', flag: '🇮🇳', name: 'India' },
  { prefix: '+62', flag: '🇮🇩', name: 'Indonesia' },
  { prefix: '+98', flag: '🇮🇷', name: 'Iran' },
  { prefix: '+964', flag: '🇮🇶', name: 'Iraq' },
  { prefix: '+353', flag: '🇮🇪', name: 'Ireland' },
  { prefix: '+39', flag: '🇮🇹', name: 'Italy' },
  { prefix: '+1-876', flag: '🇯🇲', name: 'Jamaica' },
  { prefix: '+81', flag: '🇯🇵', name: 'Japan' },
  { prefix: '+962', flag: '🇯🇴', name: 'Jordan' },
  { prefix: '+7', flag: '🇰🇿', name: 'Kazakhstan' },
  { prefix: '+254', flag: '🇰🇪', name: 'Kenya' },
  { prefix: '+686', flag: '🇰🇮', name: 'Kiribati' },
  { prefix: '+850', flag: '🇰🇵', name: 'Korea (North)' },
  { prefix: '+82', flag: '🇰🇷', name: 'Korea (South)' },
  { prefix: '+965', flag: '🇰🇼', name: 'Kuwait' },
  { prefix: '+996', flag: '🇰🇬', name: 'Kyrgyzstan' },
  { prefix: '+856', flag: '🇱🇦', name: 'Laos' },
  { prefix: '+371', flag: '🇱🇻', name: 'Latvia' },
  { prefix: '+961', flag: '🇱🇧', name: 'Lebanon' },
  { prefix: '+266', flag: '🇱🇸', name: 'Lesotho' },
  { prefix: '+231', flag: '🇱🇷', name: 'Liberia' },
  { prefix: '+218', flag: '🇱🇾', name: 'Libya' },
  { prefix: '+423', flag: '🇱🇮', name: 'Liechtenstein' },
  { prefix: '+370', flag: '🇱🇹', name: 'Lithuania' },
  { prefix: '+352', flag: '🇱🇺', name: 'Luxembourg' },
  { prefix: '+261', flag: '🇲🇬', name: 'Madagascar' },
  { prefix: '+265', flag: '🇲🇼', name: 'Malawi' },
  { prefix: '+60', flag: '🇲🇾', name: 'Malaysia' },
  { prefix: '+960', flag: '🇲🇻', name: 'Maldives' },
  { prefix: '+223', flag: '🇲🇱', name: 'Mali' },
  { prefix: '+356', flag: '🇲🇹', name: 'Malta' },
  { prefix: '+692', flag: '🇲🇭', name: 'Marshall Islands' },
  { prefix: '+222', flag: '🇲🇷', name: 'Mauritania' },
  { prefix: '+230', flag: '🇲🇺', name: 'Mauritius' },
  { prefix: '+52', flag: '🇲🇽', name: 'Mexico' },
  { prefix: '+691', flag: '🇫🇲', name: 'Micronesia' },
  { prefix: '+373', flag: '🇲🇩', name: 'Moldova' },
  { prefix: '+377', flag: '🇲🇨', name: 'Monaco' },
  { prefix: '+976', flag: '🇲🇳', name: 'Mongolia' },
  { prefix: '+382', flag: '🇲🇪', name: 'Montenegro' },
  { prefix: '+212', flag: '🇲🇦', name: 'Morocco' },
  { prefix: '+258', flag: '🇲🇿', name: 'Mozambique' },
  { prefix: '+95', flag: '🇲🇲', name: 'Myanmar' },
  { prefix: '+264', flag: '🇳🇦', name: 'Namibia' },
  { prefix: '+674', flag: '🇳🇷', name: 'Nauru' },
  { prefix: '+977', flag: '🇳🇵', name: 'Nepal' },
  { prefix: '+31', flag: '🇳🇱', name: 'Netherlands' },
  { prefix: '+64', flag: '🇳🇿', name: 'New Zealand' },
  { prefix: '+505', flag: '🇳🇮', name: 'Nicaragua' },
  { prefix: '+227', flag: '🇳🇪', name: 'Niger' },
  { prefix: '+234', flag: '🇳🇬', name: 'Nigeria' },
  { prefix: '+389', flag: '🇲🇰', name: 'North Macedonia' },
  { prefix: '+47', flag: '🇳🇴', name: 'Norway' },
  { prefix: '+968', flag: '🇴🇲', name: 'Oman' },
  { prefix: '+92', flag: '🇵🇰', name: 'Pakistan' },
  { prefix: '+680', flag: '🇵🇼', name: 'Palau' },
  { prefix: '+970', flag: '🇵🇸', name: 'Palestine' },
  { prefix: '+507', flag: '🇵🇦', name: 'Panama' },
  { prefix: '+675', flag: '🇵🇬', name: 'Papua New Guinea' },
  { prefix: '+595', flag: '🇵🇾', name: 'Paraguay' },
  { prefix: '+51', flag: '🇵🇪', name: 'Peru' },
  { prefix: '+63', flag: '🇵🇭', name: 'Philippines' },
  { prefix: '+48', flag: '🇵🇱', name: 'Poland' },
  { prefix: '+351', flag: '🇵🇹', name: 'Portugal' },
  { prefix: '+974', flag: '🇶🇦', name: 'Qatar' },
  { prefix: '+40', flag: '🇷🇴', name: 'Romania' },
  { prefix: '+7', flag: '🇷🇺', name: 'Russia' },
  { prefix: '+250', flag: '🇷🇼', name: 'Rwanda' },
  { prefix: '+1-869', flag: '🇰🇳', name: 'Saint Kitts and Nevis' },
  { prefix: '+1-758', flag: '🇱🇨', name: 'Saint Lucia' },
  { prefix: '+1-784', flag: '🇻🇨', name: 'Saint Vincent and the Grenadines' },
  { prefix: '+685', flag: '🇼🇸', name: 'Samoa' },
  { prefix: '+378', flag: '🇸🇲', name: 'San Marino' },
  { prefix: '+239', flag: '🇸🇹', name: 'Sao Tome and Principe' },
  { prefix: '+966', flag: '🇸🇦', name: 'Saudi Arabia' },
  { prefix: '+221', flag: '🇸🇳', name: 'Senegal' },
  { prefix: '+381', flag: '🇷🇸', name: 'Serbia' },
  { prefix: '+248', flag: '🇸🇨', name: 'Seychelles' },
  { prefix: '+232', flag: '🇸🇱', name: 'Sierra Leone' },
  { prefix: '+65', flag: '🇸🇬', name: 'Singapore' },
  { prefix: '+421', flag: '🇸🇰', name: 'Slovakia' },
  { prefix: '+386', flag: '🇸🇮', name: 'Slovenia' },
  { prefix: '+677', flag: '🇸🇧', name: 'Solomon Islands' },
  { prefix: '+252', flag: '🇸🇴', name: 'Somalia' },
  { prefix: '+27', flag: '🇿🇦', name: 'South Africa' },
  { prefix: '+211', flag: '🇸🇸', name: 'South Sudan' },
  { prefix: '+34', flag: '🇪🇸', name: 'Spain' },
  { prefix: '+94', flag: '🇱🇰', name: 'Sri Lanka' },
  { prefix: '+249', flag: '🇸🇩', name: 'Sudan' },
  { prefix: '+597', flag: '🇸🇷', name: 'Suriname' },
  { prefix: '+46', flag: '🇸🇪', name: 'Sweden' },
  { prefix: '+41', flag: '🇨🇭', name: 'Switzerland' },
  { prefix: '+963', flag: '🇸🇾', name: 'Syria' },
  { prefix: '+886', flag: '🇹🇼', name: 'Taiwan' },
  { prefix: '+992', flag: '🇹🇯', name: 'Tajikistan' },
  { prefix: '+255', flag: '🇹🇿', name: 'Tanzania' },
  { prefix: '+66', flag: '🇹🇭', name: 'Thailand' },
  { prefix: '+670', flag: '🇹🇱', name: 'Timor-Leste' },
  { prefix: '+228', flag: '🇹🇬', name: 'Togo' },
  { prefix: '+676', flag: '🇹🇴', name: 'Tonga' },
  { prefix: '+1-868', flag: '🇹🇹', name: 'Trinidad and Tobago' },
  { prefix: '+216', flag: '🇹🇳', name: 'Tunisia' },
  { prefix: '+90', flag: '🇹🇷', name: 'Turkey' },
  { prefix: '+993', flag: '🇹🇲', name: 'Turkmenistan' },
  { prefix: '+688', flag: '🇹🇻', name: 'Tuvalu' },
  { prefix: '+256', flag: '🇺🇬', name: 'Uganda' },
  { prefix: '+380', flag: '🇺🇦', name: 'Ukraine' },
  { prefix: '+971', flag: '🇦🇪', name: 'United Arab Emirates' },
  { prefix: '+44', flag: '🇬🇧', name: 'United Kingdom' },
  { prefix: '+1', flag: '🇺🇸', name: 'United States' },
  { prefix: '+598', flag: '🇺🇾', name: 'Uruguay' },
  { prefix: '+998', flag: '🇺🇿', name: 'Uzbekistan' },
  { prefix: '+678', flag: '🇻🇺', name: 'Vanuatu' },
  { prefix: '+39', flag: '🇻🇦', name: 'Vatican City' },
  { prefix: '+58', flag: '🇻🇪', name: 'Venezuela' },
  { prefix: '+84', flag: '🇻🇳', name: 'Vietnam' },
  { prefix: '+967', flag: '🇾🇪', name: 'Yemen' },
  { prefix: '+260', flag: '🇿🇲', name: 'Zambia' },
  { prefix: '+263', flag: '🇿🇼', name: 'Zimbabwe' },
];

function getFlag(phone) {
  try {
    const p = parsePhoneNumberFromString(phone);
    if (p?.country) return p.country.toUpperCase().replace(/./g, c => String.fromCodePoint(c.charCodeAt(0) + 127397));
  } catch {}
  return '🌍';
}


export default function Customers() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('+90');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState('');
  const [commission, setCommission] = useState('');
  const [prefixSuggestions, setPrefixSuggestions] = useState(false);
  const [prefixSearch, setPrefixSearch] = useState('');
  
  const [balanceModal, setBalanceModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [balAmount, setBalAmount] = useState('');
  const [balNote, setBalNote] = useState('');
  const [settleAmount, setSettleAmount] = useState('');
  const [showOnlyDebtors, setShowOnlyDebtors] = useState(false);
  
  const fileInputRef = useRef(null);

  const customers = useLiveQuery(async () => {
    const allOrders = await db.orders.toArray();
    let all = await db.customers.toArray();
    
    // Calculate total sales for each customer for sorting
    const salesMap = {};
    allOrders.forEach(o => {
      const cid = Number(o.customerId);
      salesMap[cid] = (salesMap[cid] || 0) + Number(o.total || 0);
    });

    all = all.map(c => ({
      ...c,
      totalSales: salesMap[c.id] || 0
    }));

    // Sort by total sales (Descending)
    all.sort((a, b) => b.totalSales - a.totalSales);
    
    // Filter by search
    if (search) {
      const q = search.toLowerCase();
      all = all.filter(c => c.name?.toLowerCase().includes(q) || c.phone?.includes(q));
    }

    // Filter by debt
    if (showOnlyDebtors) {
      const debtors = [];
      for (const c of all) {
        const bal = await Accounting.getCustomerBalance(c.id);
        if (bal > 0) {
          debtors.push(c);
        }
      }
      return debtors;
    }

    return all;
  }, [search, showOnlyDebtors]);

  const overdueDebtors = useLiveQuery(async () => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const all = await db.customers.toArray();
    const overdue = [];
    
    for (const c of all) {
      const bal = await Accounting.getCustomerBalance(c.id);
      
      // Check accountBalance loan date
      if (bal > 0 && c.createdAt && new Date(c.createdAt) < oneWeekAgo) {
        overdue.push(c);
        continue;
      }
      
      // Check orders with balance
      const orders = await db.orders.where('customerId').equals(String(c.id)).toArray();
      const hasOldDebt = orders.some(o => Number(o.balance) > 0 && new Date(o.date) < oneWeekAgo);
      if (hasOldDebt) overdue.push(c);
    }
    
    return overdue;
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('new')) {
      const q = params.get('new');
      openAdd();
      const raw = q.replace(/\D/g, ''); // strip non-digits
      if (raw.length > 0) {
        // Sort codes longest-first for accurate matching
        const sortedCodes = [...CODES].sort((a, b) => b.prefix.length - a.prefix.length);
        let detectedPrefix = '+90';
        let localNumber = raw;

        // Case 1: user typed +XXXXXXXXXXX (with plus sign)
        if (q.trim().startsWith('+')) {
          const withPlus = q.trim();
          const match = sortedCodes.find(c => withPlus.startsWith(c.prefix));
          if (match) {
            detectedPrefix = match.prefix;
            localNumber = withPlus.slice(match.prefix.length).replace(/\D/g, '');
          }
        } else {
          // Case 2: user typed digits only — try to match known prefixes
          const match = sortedCodes.find(c => raw.startsWith(c.prefix.replace('+', '')));
          if (match) {
            detectedPrefix = match.prefix;
            localNumber = raw.slice(match.prefix.replace('+', '').length);
          }
        }

        setPrefix(detectedPrefix);
        setPhone(localNumber);
      } else {
        // It's a name, not a number
        setName(q);
      }
      // Preserve redirect param if it exists
      const redirect = params.get('redirect');
      if (!redirect) navigate('/customers', { replace: true });
    }
  }, [location.search]);


  const openAdd = () => {
    setEditId(null); setName(''); setPrefix('+90'); setPhone(''); setNotes(''); setPhoto(''); setCommission('');
    setModal(true);
  };

  const openEdit = (c, e) => {
    e.stopPropagation();
    setEditId(c.id); setName(c.name || ''); setPrefix(c.countryCode || '+90');
    setPhone(c.phone?.replace(c.countryCode || '', '') || '');
    setNotes(c.notes || ''); setPhoto(c.photo || ''); 
    setCommission(c.commission || '');
    setModal(true);
  };

  const capturePhoto = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        const img = await CapCamera.getPhoto({ quality: 80, resultType: CameraResultType.DataUrl, source: CameraSource.Prompt });
        setPhoto(img.dataUrl);
      } else {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*';
        input.onchange = e => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = ev => setPhoto(ev.target.result);
          reader.readAsDataURL(file);
        };
        input.click();
      }
    } catch {}
  };

  const handleSave = async e => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) { toast.error('Name and phone required'); return; }
    
    const finalPhone = `${prefix}${phone.trim()}`;
    
    // Check for duplicate phone
    const existing = await db.customers.where('phone').equals(finalPhone).first();
    if (existing && existing.id !== editId) {
      toast.error(`Phone number already registered to: ${existing.name}`);
      return;
    }

    const data = {
      name: name.trim(), phone: finalPhone,
      countryCode: prefix, notes: notes.trim(), photo,
      commission: Number(commission) || 0,
      createdAt: new Date().toISOString(),
    };
    try {
      let newId;
      if (editId) { 
        await db.customers.update(editId, data); 
        toast.success('Updated'); 
      } else { 
        const cid = await generateId('customers');
        newId = await db.customers.add({ id: cid, ...data }); 
        toast.success('Customer added'); 
      }
      
      SyncEngine.saveForSync().catch(e => console.warn('Sync failed', e));
      
      const params = new URLSearchParams(location.search);
      if (!editId && params.get('redirect') === 'order' && newId) {
        navigate(`/order?customerId=${newId}`);
      } else {
        setModal(false);
      }
    } catch { toast.error('Error saving'); }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this customer?')) return;
    await db.customers.delete(id);
    SyncEngine.saveForSync().catch(e => console.warn('Sync failed', e));
    toast.success('Deleted');
  };

  const handleAddBalance = async () => {
    if (!selectedCustomer || !balAmount) return;
    // Log as a transaction via Accounting
    await Accounting.addTransaction(selectedCustomer.id, {
      type: 'loan',
      amount: Number(balAmount),
      note: balNote
    });
    toast.success('Balance updated');
    setBalanceModal(false);
    setBalAmount('');
    setBalNote('');
  };

  const handleSettle = async (full = false) => {
    if (!selectedCustomer) return;
    const currentBal = await Accounting.getCustomerBalance(selectedCustomer.id);
    const amountToSettle = full ? currentBal : Number(settleAmount);
    if (amountToSettle <= 0) return;
    
    await Accounting.addTransaction(selectedCustomer.id, {
      type: 'payment',
      amount: amountToSettle,
      note: 'Settlement'
    });
    
    toast.success(full ? 'Balance cleared' : 'Payment recorded');
    if (full || (currentBal - amountToSettle) <= 0) setBalanceModal(false);
    setSettleAmount('');
  };

  const handleImportExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        
        const newCustomers = [];
        const now = new Date().toISOString();
        
        // Loop from row 1 (assuming row 0 is headers: Name, Phone, Notes)
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          if (!row || !row[0]) continue;
          
          const cName = String(row[0] || '').trim();
          let cPhone = String(row[1] || '').trim();
          const cNotes = String(row[2] || '').trim();
          
          if (cName) {
            // Strip out weird characters in phone
            cPhone = cPhone.replace(/[^\d+]/g, '');
            
            let finalPhone = cPhone;
            let cPrefix = '';

            if (cPhone.startsWith('+')) {
              finalPhone = cPhone;
              // Try to find prefix for countryCode field
              const found = CODES.find(cc => cPhone.startsWith(cc.prefix));
              if (found) cPrefix = found.prefix;
            } else {
              // Try to find if it starts with a known country code without the +
              const sortedCodes = [...CODES].sort((a, b) => b.prefix.length - a.prefix.length);
              const matchedCode = sortedCodes.find(cc => cPhone.startsWith(cc.prefix.replace('+', '')));
              
              if (matchedCode) {
                finalPhone = `+${cPhone}`;
                cPrefix = matchedCode.prefix;
              } else {
                finalPhone = `+90${cPhone}`;
                cPrefix = '+90';
              }
            }

            newCustomers.push({ 
              name: cName, 
              phone: finalPhone, 
              notes: cNotes, 
              countryCode: cPrefix, 
              createdAt: now 
            });
          }
        }
        
        if (newCustomers.length > 0) {
           await db.customers.bulkAdd(newCustomers);
           toast.success(`Imported ${newCustomers.length} customers!`);
        } else {
           toast.warning('No valid data found in Excel');
        }
      } catch(err) {
        console.error(err);
        toast.error('Error parsing Excel');
      }
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };
  
  const exportCustomers = async (format) => {
    const all = await db.customers.toArray();
    if (!all.length) { toast.error('No customers to export'); return; }
    
    const data = await Promise.all(all.map(async c => ({
      'Name': c.name,
      'Phone': c.phone,
      'Notes': c.notes || '',
      'Balance': (await Accounting.getCustomerBalance(c.id)).toFixed(2),
      'Created At': new Date(c.createdAt).toLocaleDateString()
    })));
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Customers');
    
    const fileName = `BeeQueen_Customers_${new Date().toISOString().split('T')[0]}.${format}`;
    
    if (Capacitor.isNativePlatform()) {
      try {
        const bType = format === 'xlsx' ? 'xlsx' : 'csv';
        const base64 = XLSX.write(wb, { type: 'base64', bookType: bType });
        
        const res = await Filesystem.writeFile({
          path: `BeeQueenPro/backups/${fileName}`,
          data: base64,
          directory: Directory.Documents,
          recursive: true
        });
        
        await Share.share({ title: 'Export Customers', url: res.uri });
        toast.success(`Exported to ${format.toUpperCase()}`);
      } catch (err) {
        console.error('Export Error:', err);
        toast.error(`Export failed: ${err.message || 'Unknown error'}`);
      }
    } else {
      XLSX.writeFile(wb, fileName);
    }
  };

  return (
    <div className="animate-in">
      <div className="page-header">
        <h2>{t('Customers')}</h2>
        <div className="page-actions">
          <div className="search-wrap">
            <Search size={16} className="search-icon" />
            <input className="input" placeholder={t('Search...')} value={search}
              onChange={e => setSearch(e.target.value)} style={{ width: 180 }} />
          </div>
          
          <input type="file" accept=".xlsx, .xls, .csv" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImportExcel} />
          <button className="btn btn-warning" onClick={() => fileInputRef.current?.click()} title="Import Excel (Name, Phone, Notes)">
            <FileSpreadsheet size={16} /> <span className="hidden-xs">Import</span>
          </button>

          <button className="btn btn-ghost" style={{ background: 'var(--success)', color: '#fff' }} onClick={() => exportCustomers('xlsx')} title="Export Excel">
            <Download size={16} /> <span className="hidden-xs">Export Excel</span>
          </button>
          
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={16} /> <span className="hidden-xs">{t('Add')}</span>
          </button>

          <button 
            className={`btn ${showOnlyDebtors ? 'btn-danger' : 'btn-ghost'}`} 
            onClick={() => setShowOnlyDebtors(!showOnlyDebtors)}
            title="Filter by Debt"
            style={{ color: showOnlyDebtors ? '#fff' : 'var(--danger)', borderColor: showOnlyDebtors ? 'var(--danger)' : 'rgba(230,57,70,0.3)', background: showOnlyDebtors ? 'var(--danger)' : 'var(--danger-dim)' }}
          >
            <Filter size={16} /> <span className="hidden-xs">Balance</span>
          </button>
        </div>
      </div>

      {overdueDebtors?.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <p className="text-xs text-danger mb-2" style={{ fontWeight: 800 }}>⚠️ Overdue Debts (&gt; 1 week):</p>
          <div className="flex gap-2 overflow-x-auto pb-2" style={{ whiteSpace: 'nowrap' }}>
            {overdueDebtors.map(c => (
              <button 
                key={c.id} 
                className="btn btn-sm btn-ghost" 
                style={{ background: 'var(--danger-dim)', border: '1px solid var(--danger)', color: 'var(--danger)', fontSize: '11px', borderRadius: 'var(--r-full)' }}
                onClick={() => setSearch(c.name)}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 52 }}></th>
              <th>{t('Name')}</th>
              <th>{t('Phone')}</th>
              <th style={{ width: 90 }}>{t('Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {customers?.map(c => (
              <tr key={c.id}>
                <td>
                  <div className="avatar">
                    {c.photo
                      ? <img src={c.photo} alt={c.name} />
                      : <Users size={18} color="var(--muted)" />}
                  </div>
                </td>
                <td style={{ fontWeight: 600 }}>{c.name}</td>
                <td>
                  <span style={{ marginInlineEnd: '.4rem', fontSize: '1.1rem' }}>{getFlag(c.phone)}</span>
                  {c.phone}
                  <CustomerDebtBadge customerId={c.id} />
                  {c.notes && <div className="text-xs text-muted truncate" style={{ maxWidth: 180 }}>{c.notes}</div>}
                </td>
                <td>
                  <div className="flex gap-2">
                    <button className="btn btn-ghost btn-circle" onClick={() => navigate(`/order?customerId=${c.id}`)} title="New Order" style={{ background: 'var(--gold-dim)', border: '1px solid var(--gold)' }}>
                      <ShoppingBag size={15} color="var(--gold)" />
                    </button>
                    <button className="btn btn-ghost btn-circle" onClick={(e) => { e.stopPropagation(); setSelectedCustomer(c); setBalanceModal(true); }} title="Wallet" style={{ background: 'var(--gold-dim)', border: '1px solid var(--gold)' }}>
                      <Wallet size={15} color="var(--gold)" />
                    </button>
                    <button className="btn btn-ghost btn-circle" onClick={e => openEdit(c, e)} style={{ background: 'var(--s2)', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <Edit2 size={15} />
                    </button>
                    <button className="btn btn-danger btn-circle" onClick={e => handleDelete(c.id, e)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {customers?.length === 0 && (
              <tr><td colSpan={4}>
                <div className="empty-state"><Users size={40} /><p>No customers yet</p></div>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editId ? t('Edit') : t('Add Customer')}</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <div style={{ position: 'relative', cursor: 'pointer' }} onClick={capturePhoto}>
                    <div className="avatar avatar-lg" style={{ width: 80, height: 80 }}>
                      {photo ? <img src={photo} alt="Profile" /> : <Camera size={28} color="var(--muted)" />}
                    </div>
                    <div style={{
                      position: 'absolute', bottom: -4, right: -4,
                      background: 'var(--gold)', borderRadius: '50%',
                      width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}><Plus size={12} color="#000" /></div>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('Name')}</label>
                  <input className="input" value={name} onChange={e => setName(e.target.value)} required autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('Phone')}</label>
                  <div className="flex gap-2 items-center">
                    <div style={{ fontSize: '1.5rem', minWidth: '32px' }}>
                      {CODES.find(c => c.prefix === prefix)?.flag || '🌍'}
                    </div>
                    <div style={{ position: 'relative' }}>
                      <input 
                        className="input" 
                        value={prefix} 
                        onChange={e => setPrefix(e.target.value)} 
                        onFocus={() => setPrefixSuggestions(true)}
                        onBlur={() => setTimeout(() => setPrefixSuggestions(false), 200)}
                        style={{ width: 110, flexShrink: 0 }} 
                        placeholder="+XXX"
                      />
                      {prefixSuggestions && (
                        <div style={{
                          position: 'absolute', top: '100%', left: 0, 
                          background: 'var(--s3)', borderRadius: 'var(--r-md)', 
                          zIndex: 100, border: '1px solid var(--gold-dim)',
                          boxShadow: 'var(--sh-md)', marginTop: '4px', overflow: 'hidden',
                          width: 250, maxHeight: 200, overflowY: 'auto'
                        }}>
                          {CODES.filter(c => c.prefix.includes(prefix) || c.name.toLowerCase().includes(prefix.toLowerCase())).slice(0, 8).map(c => (
                            <button 
                              key={`${c.name}-${c.prefix}`} 
                              type="button"
                              className="btn btn-ghost w-full" 
                              style={{ justifyContent: 'flex-start', borderRadius: 0, fontSize: '13px', padding: '8px 12px' }}
                              onClick={() => { setPrefix(c.prefix); setPrefixSuggestions(false); }}
                            >
                              <span style={{ marginRight: 8 }}>{c.flag}</span>
                              <span style={{ flex: 1, textAlign: 'left' }}>{c.name}</span>
                              <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{c.prefix}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <input className="input" type="tel" value={phone}
                      onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} required placeholder="5XX XXX XXXX" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('Notes')}</label>
                  <textarea className="input" value={notes} onChange={e => setNotes(e.target.value)}
                    rows={2} style={{ resize: 'none' }} placeholder="Optional notes..." />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('Commission')}</label>
                  <input className="input" type="number" value={commission} onChange={e => setCommission(e.target.value)} placeholder="0.00" />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setModal(false)}>{t('Cancel')}</button>
                <button type="submit" className="btn btn-primary">{t('Save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {balanceModal && selectedCustomer && (
        <div className="modal-backdrop" onClick={() => setBalanceModal(false)}>
          <div className="modal animate-in" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Wallet size={20} color="var(--gold)" /> {selectedCustomer.name}
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setBalanceModal(false)}><X size={20}/></button>
            </div>
            
            <div style={{ padding: '1.5rem' }}>
              <div style={{ background: 'var(--danger-dim)', padding: '1rem', borderRadius: 'var(--r-md)', marginBottom: '1.5rem', textAlign: 'center' }}>
                <div className="text-muted text-sm">Current Debt</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--danger)' }}>
                  {Number(selectedCustomer.accountBalance || 0).toFixed(2)}
                </div>
                {selectedCustomer.balanceNote && <div className="text-sm mt-1">Note: {selectedCustomer.balanceNote}</div>}
              </div>

              <div className="mb-4">
                <label className="form-label">Add New Loan</label>
                <div className="flex gap-2 mb-2">
                  <input 
                    type="number" className="input" placeholder="Amount" 
                    value={balAmount} onChange={e => setBalAmount(e.target.value)} 
                  />
                  <button className="btn btn-primary" onClick={handleAddBalance}><Plus size={18}/></button>
                </div>
                <input 
                  className="input" placeholder="Loan Note (e.g. for what?)" 
                  value={balNote} onChange={e => setBalNote(e.target.value)} 
                />
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.05)', margin: '1.5rem 0' }} />

              <div>
                <label className="form-label">Settle Balance</label>
                <div className="flex gap-2">
                  <input 
                    type="number" className="input" placeholder="Amount to pay" 
                    value={settleAmount} onChange={e => setSettleAmount(e.target.value)} 
                  />
                  <button className="btn btn-success" onClick={() => handleSettle(false)}>Pay</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => handleSettle(true)}>Pay All</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function CustomerDebtBadge({ customerId }) {
  const balance = useLiveQuery(() => Accounting.getCustomerBalance(customerId), [customerId]);
  if (!balance || balance <= 0) return null;
  return (
    <span style={{ color: 'var(--danger)', marginLeft: '0.8rem', fontWeight: 800 }}>
      [Debt: {balance.toFixed(2)}]
    </span>
  );
}
