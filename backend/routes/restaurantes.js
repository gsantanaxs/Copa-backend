import express from 'express'
import { supabase } from '../supabase/client.js'
import { verificarToken } from '../middleware/auth.js'
import multer from 'multer'
import { supabaseAdmin } from '../supabase/client.js'

const router = express.Router()

// Configurar upload de imagens
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
})

// Listar restaurantes
router.get('/', async (req, res) => {
    const { cidade, tipo_comida, minNota } = req.query
    
    let query = supabase
        .from('avaliacoes_restaurantes')
        .select('*')
        .order('data_avaliacao', { ascending: false })
    
    if (cidade) query = query.eq('cidade', cidade)
    if (tipo_comida) query = query.eq('tipo_comida', tipo_comida)
    if (minNota) query = query.gte('nota_comida', minNota)
    
    const { data, error } = await query
    
    if (error) {
        return res.status(500).json({ error: error.message })
    }
    
    res.json(data)
})

// Criar avaliação com foto
router.post('/', verificarToken, upload.single('foto'), async (req, res) => {
    let foto_url = null
    
    // Upload da foto para Supabase Storage
    if (req.file) {
        const fileName = `${Date.now()}_${req.file.originalname}`
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from('fotos-restaurantes')
            .upload(fileName, req.file.buffer, {
                contentType: req.file.mimetype
            })
        
        if (!uploadError) {
            const { data: { publicUrl } } = supabaseAdmin.storage
                .from('fotos-restaurantes')
                .getPublicUrl(fileName)
            foto_url = publicUrl
        }
    }
    
    const avaliacao = {
        ...req.body,
        usuario_id: req.usuario.id,
        foto_url,
        data_avaliacao: new Date()
    }
    
    // Converter notas para números
    avaliacao.nota_comida = parseInt(avaliacao.nota_comida)
    avaliacao.nota_atendimento = parseInt(avaliacao.nota_atendimento)
    avaliacao.nota_preco = parseInt(avaliacao.nota_preco)
    
    const { data, error } = await supabase
        .from('avaliacoes_restaurantes')
        .insert([avaliacao])
        .select()
        .single()
    
    if (error) {
        return res.status(500).json({ error: error.message })
    }
    
    res.status(201).json({ success: true, data })
})

// Melhores restaurantes por tipo
router.get('/melhores/:cidade', async (req, res) => {
    const { cidade } = req.params
    
    const { data, error } = await supabase
        .from('avaliacoes_restaurantes')
        .select('nome_estabelecimento, tipo_comida, nota_comida, nota_atendimento, preco_medio')
        .eq('cidade', cidade)
        .order('nota_comida', { ascending: false })
        .limit(20)
    
    if (error) {
        return res.status(500).json({ error: error.message })
    }
    
    res.json(data)
})

export default router