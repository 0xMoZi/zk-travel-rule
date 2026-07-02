// Juri klik "Initiate Transfer" di VASP_A panel
//   ↓
// Frontend (pakai vasp_a keypair) generate Alice proof + submit_intent
//   ↓
// VASP_B panel auto-detect intent (polling contract setiap 3 detik)
//   ↓
// VASP_B panel auto-generate Bob proof + counter_sign
//   ↓
// Kedua panel update status secara real-time
//   ↓
// VASP_A kirim XLM setelah is_cleared() = true
// Juri melihat dua panel aktif secara simultan — ini yang impressive. Bukan juri yang "menjadi" VASP_A atau VASP_B, tapi juri yang mengobservasi dua institusi berinteraksi secara trustless.

// Keypair Aman di Testnet
// Karena ini testnet, tidak ada real funds yang at risk. Hardcode keypair di frontend untuk demo adalah standard practice di hackathon.
