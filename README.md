# Club17_menu

Digital customer QR-code menu and table ordering application for **CLUB 17 Lounge & Bar**.  
Connects directly to the CLUB 17 POS database to provide live real-time menu items, categories, stock, and prices.

## Deploying on Vercel

1. Import this repository into Vercel.
2. Under **Project Settings &rarr; Environment Variables**, add your environment variables:
   - `POS_MONGODB_URI`
   - `NEXT_PUBLIC_POS_SOCKET_URL`
   - `NEXT_PUBLIC_APP_URL`
3. Deploy! Customers scanning table QR codes will land directly on `/menu?table=X`.
