import express from 'express'
import { supabase } from '../supabase/client.js'
import { verificarToken } from '../middleware/auth.js'
import { body, validationResult } from 'express-validator'

const router = express.Router()

// GET - Contar likes de uma avaliação
router.get('/:avaliacao_id', async (req, res) => {
    const { avaliacao_id } = req.params

    const { count, error } = await supabase
        .from('likes_avaliacoes')
        .select('*', { count: 'exact', head: true })
        .eq('avaliacao_id', avaliacao_id)

    if (error) {
        return res.status(500).json({ error: error.message })
    }

    res.json({ avaliacao_id, total_likes: count })
})

// POST - Curtir avaliação (toggle: curte se não curtiu, remove se já curtiu)
router.post('/', verificarToken, [
    body('avaliacao_id').notEmpty(),
    body('tipo_avaliacao').isIn(['estadio', 'restaurante', 'transporte'])
], async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }

    const { avaliacao_id, tipo_avaliacao } = req.body
    const usuario_id = req.usuario.id

    // Verificar se o usuário já curtiu essa avaliação
    const { data: likeExistente, error: erroConsulta } = await supabase
        .from('likes_avaliacoes')
        .select('id')
        .eq('avaliacao_id', avaliacao_id)
        .eq('usuario_id', usuario_id)
        .maybeSingle()

    if (erroConsulta) {
        return res.status(500).json({ error: erroConsulta.message })
    }

    if (likeExistente) {
        // Já curtiu -> remove o like (toggle off)
        const { error } = await supabase
            .from('likes_avaliacoes')
            .delete()
            .eq('id', likeExistente.id)

        if (error) {
            return res.status(500).json({ error: error.message })
        }

        return res.json({ success: true, liked: false })
    }

    // Ainda não curtiu -> cria o like
    const { data, error } = await supabase
        .from('likes_avaliacoes')
        .insert([{
            avaliacao_id,
            tipo_avaliacao,
            usuario_id,
            data_criacao: new Date()
        }])
        .select()
        .single()

    if (error) {
        return res.status(500).json({ error: error.message })
    }

    res.status(201).json({ success: true, liked: true, data })
})

// DELETE - Remover like explicitamente
router.delete('/:avaliacao_id', verificarToken, async (req, res) => {
    const { avaliacao_id } = req.params
    const usuario_id = req.usuario.id

    const { error } = await supabase
        .from('likes_avaliacoes')
        .delete()
        .eq('avaliacao_id', avaliacao_id)
        .eq('usuario_id', usuario_id)

    if (error) {
        return res.status(500).json({ error: error.message })
    }

    res.json({ success: true, message: 'Like removido' })
})

export default router
