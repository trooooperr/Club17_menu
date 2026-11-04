# Club17_menu

Digital customer QR-code menu and table ordering application for **CLUB 17 Lounge & Bar**.  
Connects directly to the CLUB 17 POS database to provide live real-time menu items, categories, stock, and prices.

## Deploying on Vercel

1. Import this repository into Vercel.
2. Under **Project Settings &rarr; Environment Variables**, add:
   ```env
   POS_MONGODB_URI=mongodb+srv://cafeteriahumtum_db_user:shubhmongo@humtumbar.qmpx6x8.mongodb.net/club17?retryWrites=true&w=majority&appName=HUMTUMBAR
   NEXT_PUBLIC_POS_SOCKET_URL=https://club17.onrender.com
   ```
3. Deploy! Customers scanning table QR codes will land directly on `/menu?table=X`.
