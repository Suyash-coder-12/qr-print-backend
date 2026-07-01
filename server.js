const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const Razorpay = require('razorpay');
const path = require('path');

const app = express();
const server = http.createServer(app);

// -----------------------------------------
// 1. MIDDLEWARES (Security aur Parsing)
// -----------------------------------------
app.use(cors());
app.use(express.json());

// Sabse zaroori: Dukan wale PC ko file download karne ki permission dena
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer setup - Files temporarily save karne ke liye
const upload = multer({ dest: 'uploads/' });

// -----------------------------------------
// 2. RAZORPAY SETUP
// -----------------------------------------
const razorpay = new Razorpay({
    key_id: 'rzp_test_T8E9jrcaKG6WHM',
    key_secret: 'OsjGtvUjeEn71uNqXLZI0eRn'
});

// -----------------------------------------
// 3. SOCKET.IO (Real-time Connection)
// -----------------------------------------
const io = new Server(server, { 
    cors: { origin: '*' } 
});

io.on('connection', (socket) => {
    console.log('🔗 Dukan wala PC Connect Hua! ID:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('❌ PC Disconnect Ho Gaya:', socket.id);
    });
});

// -----------------------------------------
// 4. APIs / ROUTES
// -----------------------------------------

// API 1: Basic Health Check
app.get('/', (req, res) => {
    res.send('Bhai tera QR Print Backend ekdum kadak chal raha hai!');
});

// API 2: Razorpay Order Banane Ke Liye (Jab user "Pay" pe click kare)
app.post('/create-order', async (req, res) => {
    try {
        const options = {
            amount: 1000, // ₹10 ka bill (Razorpay me amount hamesha paise me jata hai)
            currency: "INR",
            receipt: "print_order_" + Date.now()
        };
        const order = await razorpay.orders.create(options);
        res.json(order);
    } catch (error) {
        console.error("❌ Order Error:", error);
        res.status(500).json({ error: 'Razorpay order nahi ban paya' });
    }
});

// API 3: File Upload Aur Print Signal (Jab payment successful ho jaye)
app.post('/pay-and-print', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Bhai koi file upload nahi hui!' });
    }
    
    console.log('📄 Nayi file print ke liye aayi:', req.file.originalname);

    // Dukan wale PC ke liye ek Direct Download URL generate karna
   const fileDownloadUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    
    // Yaha se Socket.io ke through dukan wale PC ko alert jata hai
    io.emit('print-job', {
        fileName: req.file.originalname,
        filePath: req.file.path,
        downloadUrl: fileDownloadUrl 
    });
    
    res.json({ 
        message: 'Payment Done! Backend ne print command bhej di hai.',
        file: req.file.originalname 
    });
});

// -----------------------------------------
// 5. START SERVER
// -----------------------------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Master Server port ${PORT} par daud raha hai`);
});