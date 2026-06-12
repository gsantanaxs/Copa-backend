import express from 'express'
import { supabase } from '../supabase/client.js'
import { verificarToken } from '../middleware/auth.js'

const router = express.Router()

// Listar transportes
router.get('/', async (req, res) => {
    const { cidade, tipo } = req.query
    
    let query = supabase
        .from('avaliacoes_transportes')
        .select('*')
        .order('data_avaliacao', { ascending: false })
    
    if (cidade) {
        query = query.eq('cidade', cidade)
    }
    
    if (tipo) {
        query = query.eq('tipo_transporte', tipo)
    }
    
    const { data, error } = await query
    
    if (error) {
        return res.status(500).json({ error: error.message })
    }
    
    res.json(data)
})

// Criar avaliação de transporte
router.post('/', verificarToken, async (req, res) => {
    const avaliacao = {
        ...req.body,
        usuario_id: req.usuario.id,
        data_avaliacao: new Date()
    }
    
    const { data, error } = await supabase
        .from('avaliacoes_transportes')
        .insert([avaliacao])
        .select()
        .single()
    
    if (error) {
        return res.status(500).json({ error: error.message })
    }
    
    res.status(201).json({ success: true, data })
})

// Melhores rotas por cidade
router.get('/melhores-rotas/:cidade', async (req, res) => {
    const { cidade } = req.params
    
    const { data, error } = await supabase
        .from('avaliacoes_transportes')
        .select('tipo_transporte, nome_linha, qualidade, tempo_espera')
        .eq('cidade', cidade)
        .gte('qualidade', 4) // Nota mínima 4
    
    if (error) {
        return res.status(500).json({ error: error.message })
    }
    
    res.json(data)
})

export default router