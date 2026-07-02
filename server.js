const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const Razorpay = require('razorpay');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// CORS Setup
app.use(cors({
    origin: "https://incomparable-squirrel-587950.netlify.app", 
    methods: ["GET", "POST"],
    credentials: true
}));
app.use(express.json());

// 🚨 FIX 1: Uploads folder ko public banana zaroori hai taaki PC file download kar sake
app.use('/uploads', express.static('uploads'));

const razorpay = new Razorpay({
    key_id: 'rzp_live_T8ZRWItJQxIpnR',
    key_secret: 'u49LnKlrXYzpMQnming2cF6D'
});

const upload = multer({ dest: 'uploads/' });

io.on('connection', (socket) => {
    console.log('✅ Dukan PC Connected to Live Pipeline!');
});

// Create Order Route
app.post('/create-order', async (req, res) => {
    try {
        const amount = req.body.amount || 10; 
        const options = {
            amount: amount * 100,
            currency: "INR",
            receipt: "receipt_" + Date.now()
        };
        const order = await razorpay.orders.create(options);
        res.json(order);
    } catch (error) {
        res.status(500).send(error);
    }
});

// PDF / Image Route
app.post('/pay-and-print', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    
    // 🚨 FIX 2: Full URL bhejna aur variable ka naam 'url' rakhna
    const fullPath = req.file.path.replace(/\\/g, '/'); // Windows aur Linux dono ke liye safe
    const downloadUrl = `https://qr-print-backend.onrender.com/${fullPath}`;
    
    io.emit('print-job', { url: downloadUrl, filename: req.file.originalname });
    
    res.json({ success: true, message: "Sent to printer!" });
});

// ID Card Route
app.post('/pay-and-print-id', upload.fields([{ name: 'front' }, { name: 'back' }]), async (req, res) => {
    try {
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([595.28, 841.89]);

        const frontImageBytes = fs.readFileSync(req.files['front'][0].path);
        const backImageBytes = fs.readFileSync(req.files['back'][0].path);

        const embedImage = async (bytes, mimetype) => {
            if (mimetype === 'image/png') return await pdfDoc.embedPng(bytes);
            return await pdfDoc.embedJpg(bytes);
        };

        const frontImg = await embedImage(frontImageBytes, req.files['front'][0].mimetype);
        const backImg = await embedImage(backImageBytes, req.files['back'][0].mimetype);

        const idWidth = 240; 
        const idHeight = 150; 
        
        page.drawImage(frontImg, { x: 175, y: 600, width: idWidth, height: idHeight });
        page.drawImage(backImg, { x: 175, y: 430, width: idWidth, height: idHeight });

        const pdfBytes = await pdfDoc.save();
        const filename = `ID_Card_${Date.now()}.pdf`;
        const relativePath = `uploads/${filename}`;
        fs.writeFileSync(relativePath, pdfBytes);

        // 🚨 FIX 3: Full URL set karna ID Card ke liye
        const downloadUrl = `https://qr-print-backend.onrender.com/${relativePath}`;
        io.emit('print-job', { url: downloadUrl, filename: filename });

        res.json({ success: true, message: "ID Card Merged & Sent to Printer!" });

    } catch (error) {
        console.error("Merging Error:", error);
        res.status(500).json({ error: "Failed to process ID Card" });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});