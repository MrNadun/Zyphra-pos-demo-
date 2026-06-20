# MiniPOS - Professional Point of Sale System

A comprehensive, feature-rich Point of Sale (POS) system built with vanilla JavaScript, HTML5, and CSS3. Designed for small to medium-sized retail businesses.

## 🌟 Features

### Core POS Features
- **Product Management** - Add, edit, and manage inventory with categories and stock tracking
- **Shopping Cart** - Dynamic cart with quantity adjustment and real-time calculations
- **Billing & Checkout** - Complete sales transaction processing with multiple payment methods
- **Invoicing** - Generate and print professional invoices with detailed breakdown
- **Customer Management** - Create and track customer information and purchase history

### Advanced Features
- **Inventory Management**
  - Low stock alerts
  - Category-based filtering
  - Search functionality
  - Real-time stock updates

- **Expense Tracking**
  - Track business expenses by category
  - Date-based filtering
  - Searchable expense history

- **Analytics & Reports**
  - Daily sales charts (last 7 days)
  - Top-selling items visualization
  - Sales by category breakdown
  - Real-time profit calculations
  - Stock alert dashboard
  - Multiple performance metrics (Today's Sales, Monthly Sales, Total Sales, Profit, Invoice Count)

- **Payment Methods**
  - Cash
  - Card
  - Check
  - Other

- **Discount & Tax**
  - Percentage-based discounts
  - Fixed amount discounts
  - Configurable tax rates
  - Real-time total calculations

- **User Session Management**
  - Secure login/registration
  - User-specific data storage
  - Session management

## 📊 Database Structure

### Products
```json
{
  "id": "unique_id",
  "sku": "ITEM0001",
  "name": "Product Name",
  "category": "Electronics",
  "price": 99.99,
  "stock": 10
}
```

### Customers
```json
{
  "id": "unique_id",
  "name": "Customer Name",
  "email": "email@example.com",
  "phone": "+1-555-0000",
  "address": "Customer Address"
}
```

### Invoices
```json
{
  "id": "INV_timestamp",
  "date": "ISO_date",
  "customer": "customer_id",
  "items": [...],
  "subtotal": 0,
  "discountPct": 0,
  "discountAmt": 0,
  "taxPct": 0,
  "taxAmt": 0,
  "total": 0,
  "paymentMethod": "cash",
  "status": "completed"
}
```

### Expenses
```json
{
  "id": "unique_id",
  "date": "date",
  "name": "Expense Name",
  "category": "Category",
  "amount": 0,
  "description": "Details"
}
```

## 🚀 Getting Started

### Prerequisites
- Modern web browser (Chrome, Firefox, Edge, Safari)
- No backend server required
- No installation needed

### Installation
1. Clone or download the repository
2. Open `login.html` in your web browser
3. Use default credentials:
   - Username: `admin`
   - Password: `admin123`

### First Steps
1. Login with the default credentials
2. Seed sample data to populate the system
3. Explore each section:
   - **Products**: View, add, edit, and manage inventory
   - **Billing**: Create sales transactions
   - **Customers**: Add and manage customer information
   - **Invoices**: View transaction history
   - **Expenses**: Track business expenses
   - **Analytics**: View business metrics and charts

## 📱 Views

### 📦 Products
- Browse all products with filters
- Search by name or SKU
- Filter by category
- View low stock items
- Edit product information
- Delete products

### 🛒 Billing
- Add products to cart with quantity adjustment
- Apply discounts (percentage or fixed amount)
- Select payment method
- Search and assign customers
- Calculate real-time totals with tax
- Print invoice preview
- Complete checkout

### 👥 Customers
- Add new customers
- View customer purchase history
- Edit customer information
- Track total purchases
- Delete customer records

### 📋 Invoices
- View all past invoices
- Search invoices by ID or customer name
- View detailed invoice information
- Delete invoice records

### 💰 Expenses
- Add business expenses
- Categorize expenses
- Search and filter expenses
- View expense history
- Delete expense records

### 📊 Analytics
- View today's, monthly, and total sales
- Calculate today's profit
- Display stock alerts
- 7-day sales chart
- Top-selling items visualization
- Sales by category breakdown
- All metrics update in real-time

## 🔐 Data Storage

All data is stored locally using:
- **localStorage** - Primary storage for all data (user-indexed)
- **JSON Files** - Fallback for initial data loading
  - `database/products.json` - Sample products
  - `database/customers.json` - Sample customers
  - `database/invoices.json` - Sample invoices

Data is automatically saved to localStorage and persists across sessions.

## 🎨 Styling

- **Dark Modern Theme** with purple accents
- Responsive design for various screen sizes
- Smooth animations and transitions
- Professional statistics cards
- Interactive charts using Chart.js
- Mobile-friendly layout

## 🛠️ Technologies Used

- **HTML5** - Structure and layout
- **CSS3** - Modern styling with CSS variables
- **JavaScript (ES6+)** - Core functionality
- **Chart.js** - Data visualization
- **localStorage** - Client-side data persistence
- **JSON** - Data format

## 📝 Usage Tips

1. **Adding Products**
   - Click "+ Add Product" to create new items
   - SKU is auto-generated
   - Set categories for better organization
   - Adjust stock as inventory changes

2. **Sales Process**
   - Search for products in the billing section
   - Add items with desired quantity
   - Apply customer discount if applicable
   - Set tax rate
   - Select payment method
   - Click Checkout to save the invoice

3. **Managing Data**
   - Use "Seed Data" to load sample products
   - "Clear All" will delete everything (use carefully!)
   - All data is user-specific
   - Export invoices as PDF using browser print function

4. **Analytics**
   - Charts update automatically with new sales
   - Stock alerts show items with 5 or fewer units
   - All metrics are real-time calculations

## 🔄 Workflow

```
Login → Browse/Add Products → Make Sales → View Analytics → Manage Expenses
```

## 🎯 Perfect For

- Retail stores
- Electronics shops
- Services businesses
- Small product sellers
- Inventory tracking
- Sales reporting

## 📈 Future Enhancements

Potential features for future versions:
- Multi-user roles (Admin, Cashier, Manager)
- Barcode scanning integration
- Return/Exchange management
- Commission tracking for salespeople
- Multi-currency support
- Cloud backup
- API integration
- Mobile app

## 💡 Notes

- Data is stored per user (different users have separate data)
- Logout will end the session
- Browser must allow localStorage
- Best viewed on Chrome, Firefox, or Edge
- Responsive but optimized for desktop use

## 📄 License

This project is provided as-is for educational and commercial use.

---

**Version:** 2.0 (Enhanced)  
**Last Updated:** 2026/03/24
**Built with ❤️ for small business owners**
