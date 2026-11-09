import Dexie from 'dexie';

export const db = new Dexie('BeeQueenPro');

db.version(6).stores({
  customers:  '++id, name, phone, countryCode, createdAt, accountBalance',
  models:     'code, wholesalePrice, retailPrice, size, category, factoryId',
  stock:      '++id, modelCode, color, size, quantity, [modelCode+color]',
  orders:     '++id, customerId, date, status, total, deposit, balance, isSparis, isCollected',
  orderItems: '++id, orderId, modelCode, color, size, quantity, unitPrice, discount',
  returns:    '++id, orderId, customerId, date, totalRefund',
  payments:   '++id, orderId, amount, type, date',
  colors:     '++id, name, hex',
  cart:       '++id, modelCode, color, size, quantity, discount, [modelCode+color]',
  settings:   'id',
  factories:       '++id, name',
  factorySupplies: '++id, factoryId, supplyNo, date',
  factoryItems:    '++id, supplyId, modelCode',
  factoryPayments: '++id, factoryId, paymentNo, date',
  factoryReturns:  '++id, factoryId, date'
});

db.version(7).stores({
  customers:  '++id, name, phone, countryCode, createdAt, accountBalance',
  models:     'code, wholesalePrice, retailPrice, size, category, factoryId',
  stock:      '++id, modelCode, color, size, quantity, [modelCode+color]',
  orders:     '++id, customerId, date, status, total, deposit, balance, isSparis, isCollected',
  orderItems: '++id, orderId, modelCode, color, size, quantity, unitPrice, discount',
  returns:    '++id, orderId, customerId, date, totalRefund',
  payments:   '++id, orderId, amount, type, date',
  colors:     '++id, name, hex',
  cart:       '++id, modelCode, color, size, quantity, discount, [modelCode+color]',
  settings:   'id',
  factories:       '++id, name',
  factorySupplies: '++id, factoryId, supplyNo, date',
  factoryItems:    '++id, supplyId, modelCode',
  factoryPayments: '++id, factoryId, paymentNo, date',
  factoryReturns:  '++id, factoryId, date',
  // Pre-Order audit log
  preOrderLogs: '++id, orderId, action, timestamp'
});

db.version(8).stores({
  customers:  '++id, name, phone, countryCode, createdAt, accountBalance',
  models:     'code, wholesalePrice, retailPrice, size, category, factoryId',
  stock:      '++id, modelCode, color, size, quantity, [modelCode+color]',
  orders:     '++id, customerId, date, status, total, deposit, balance, isSparis, isCollected',
  orderItems: '++id, orderId, modelCode, color, size, quantity, unitPrice, discount',
  returns:    '++id, orderId, customerId, date, totalRefund',
  payments:   '++id, orderId, amount, type, date',
  colors:     '++id, name, hex',
  cart:       '++id, modelCode, color, size, quantity, discount, [modelCode+color]',
  settings:   'id',
  factories:       '++id, name',
  factorySupplies: '++id, factoryId, supplyNo, date',
  factoryItems:    '++id, supplyId, modelCode',
  factoryPayments: '++id, factoryId, paymentNo, date',
  factoryReturns:  '++id, factoryId, date',
  preOrderLogs: '++id, orderId, action, timestamp',
  // Wallet — shop expenses tracker
  walletEntries: '++id, category, date'
});

db.version(9).stores({
  customers:  '++id, name, phone, countryCode, createdAt, accountBalance, commission',
  models:     'code, wholesalePrice, retailPrice, factoryPrice, discountPrice, size, category, factoryId',
  stock:      '++id, modelCode, color, size, quantity, [modelCode+color]',
  orders:     '++id, customerId, date, status, total, deposit, balance, isSparis, isCollected',
  orderItems: '++id, orderId, modelCode, color, size, quantity, unitPrice, discount',
  returns:    '++id, orderId, customerId, date, totalRefund',
  payments:   '++id, orderId, amount, type, date',
  colors:     '++id, name, hex',
  cart:       '++id, modelCode, color, size, quantity, discount, [modelCode+color]',
  settings:   'id',
  factories:       '++id, name',
  factorySupplies: '++id, factoryId, supplyNo, date',
  factoryItems:    '++id, supplyId, modelCode',
  factoryPayments: '++id, factoryId, paymentNo, date',
  factoryReturns:  '++id, factoryId, date',
  preOrderLogs: '++id, orderId, action, timestamp',
  walletEntries: '++id, category, date, type, currency'
});

db.on('populate', async () => {
  await db.settings.add({
    id: 1,
    storeName:    'Bee Queen',
    storeAddress: 'Küçük langa Cad No 18/39 Bilir iş Merkezi Yenikapı-Aksaray/İST',
    phone:        '+90 5373 766 119',
    logo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAqMAAAGzCAYAAAAboR5uAAAQAElEQVR4Aez9B4AcR5qmB78RmVlV7b23MA2PhveOcARJ0A853s+a293bk1npTtKddKdbnU5mT9J/tzuzuzPDWTccQw96Dr0FDWhADwKEB9rb8mnifyO7G2iAAAiCMG0ikV9GZGRkRHxPJrLe+qKqWsIshoAhYAgYAoaAIWAIGAKGwBUiYMToFQJvujUEDIHJSMD4bAgYAoaAIXA6ASNGTydi9g0BQ8AQMAQMAUPAEDAELhuBSyZGL5sHpiNDwBAwBAwBQ8AQMAQMgXFLwIjRcXvpzMANAUPAEDhBwGQMAUPAEBi3BIwYHbeXzgzcEDAEDAFDwBAwBAyB8U9g/InR8c/ceGAIGAKGgCFgCBgChoAhMEzAiNFhECYxBAwBQ8AQ+CwBU2IIGAKGwKUmYMTopSZs2jcEDAFDwBAwBAwBQ8AQOCsBI0ZPoDEZQ8AQMAQMAUPAEDAEDIHLTcCI0XXfT111zTbbVqxcmXvdNSuKrtu8rPCaDQujW1fNtzcsno6Vs2uweVoV5tVXoIXt1TcWoQRmMQQMAUPAEDgnASNGz4nHHDAEDIFJSIBzwh709A909vVncg6E6O5SAnlBIJAWlZNC5qYfEgrSgqLNoOgoZ6pT02GzG7NoC0lAEY360oKiq60qrZ5RXVw/J7eYp+R5Z8vM0DAEDAFDYPIQ4FPr8vRkejEEDIH3IpByIBX09fdlB/0AsBxl2xY0YFp88qfV6Xq08NAn7Cj9mD+O6hBCAEJRlFpCU2R6WmgK9InhD+hT9uG77OQpY7u2I0iREp6mXvK9pM1D0L2p0mN97/T6TofXm98YVfK2GzG76mprZpYVFlRUlvC0WQ0BQ8AQMAQmuN8z7xoChoAhcFoCTpAnp6+/vz+VDuG7ZpQG/7eInKIEfWJIdfS/KUKNf9mUPvJEUvU0YgUURn3uW7BlyOto6C9pZpP6kK2T7k6vH0NByE00A6U3rG02hOf66C978vR7UqD9SInHlA79pInu8o6Ojt7ubm3N3XUv09EQMAQMgclPgP5VavK7bjw2BAyBcUtgaDA50DfY0+N7AdzY/7YIdfRPrNChp74tPjX6I8Vf+NQUolqUKkqF8D0K+pYVvG9Q/R96uO98rYwV0A/oO5/v25e+83f6eP927j3f69jX99GvffS9fVf3fVzf/X98vO14X/9A/+HjR9v/H6+uE+XFp1W6AAAAAElFTkSuQmCC',
    activeLanguage: 'ar',
    currency:     '$',
    syncFolder:   '',
    resedaLink:   'https://google.com',
    lastInventoryReportDate: '',
    linkMessage: '',
    messageLinkEnabled: false,
    deviceId: 1,
  });

  await db.colors.bulkAdd([
    { name: 'Black',  hex: '#000000' },
    { name: 'White',  hex: '#FFFFFF' },
    { name: 'Red',    hex: '#E63946' },
    { name: 'Navy',   hex: '#1D3557' },
    { name: 'Camel',  hex: '#C19A6B' },
    { name: 'Beige',  hex: '#F5F0E8' },
    { name: 'Pink',   hex: '#FFB3C1' },
    { name: 'Green',  hex: '#2A9D8F' },
    { name: 'Grey',   hex: '#8D99AE' },
    { name: 'Brown',  hex: '#7B3F00' },
  ]);
});

export const generateId = async (tableName) => {
  const settings = await db.settings.get(1);
  const deviceId = Number(settings?.deviceId) || 1;
  const minId = deviceId * 1000000;
  const maxId = minId + 999999;
  
  const lastItem = await db[tableName]
    .where('id').between(minId, maxId, true, true)
    .reverse().first();
    
  return lastItem ? lastItem.id + 1 : minId;
};
