import express from 'express'
import { supabase } from '../supabase/client.js'
import { verificarToken } from '../middleware/auth.js'
import { body, query, validationResult } from 'express-validator'

const router = express.Router()

// ============================================
// GET - Listar avaliações de estádios (usando VIEW)
// ============================================
router.get('/', [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    query('cidade').optional().isString(),
    query('estadio').optional().isString(),
    query('minNota').optional().isInt({ min: 1, max: 5 })
], async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1
        const limit = parseInt(req.query.limit) || 10
        const offset = (page - 1) * limit
        
        // 🟢 USANDO A VIEW
        let query = supabase
            .from('avaliacoes_estadios_view')
            .select('*', { count: 'exact' })
            .order('data_avaliacao', { ascending: false })
            .range(offset, offset + limit - 1)
        
        if (req.query.cidade) {
            query = query.ilike('cidade', `%${req.query.cidade}%`)
        }
        
        if (req.query.estadio) {
            query = query.ilike('estadio_nome', `%${req.query.estadio}%`)
        }
        
        if (req.query.minNota) {
            query = query.gte('nota_geral', parseInt(req.query.minNota))
        }
        
        const { data, error, count } = await query
        
        if (error) {
            console.error('Erro na query:', error)
            return res.status(500).json({ error: error.message })
        }
        
        // Formatar dados
        const formattedData = data.map(item => ({
            id: item.id,
            usuario_id: item.usuario_id,
            estadio_nome: item.estadio_nome,
            cidade: item.cidade,
            nota_geral: item.nota_geral,
            nota_acesso: item.nota_acesso,
            nota_seguranca: item.nota_seguranca,
            nota_estrutura: item.nota_estrutura,
            comentario: item.comentario,
            data_avaliacao: item.data_avaliacao,
            created_at: item.created_at,
            usuarios: {
                id: item.usuario_id,
                email: item.usuario_email,
                nome: item.usuario_nome || 'Torcedor'
            }
        }))
        
        res.json({
            success: true,
            data: formattedData,
            pagination: {
                page,
                limit,
                total: count || 0,
                totalPages: Math.ceil((count || 0) / limit)
            }
        })
        
    } catch (error) {
        console.error('Erro ao listar avaliações:', error)
        res.status(500).json({ error: 'Erro interno do servidor' })
    }
})

// ============================================
// GET - Buscar uma avaliação por ID
// ============================================
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params
        
        const { data, error } = await supabase
            .from('avaliacoes_estadios_view')
            .select('*')
            .eq('id', id)
            .single()
        
        if (error) {
            return res.status(404).json({ error: 'Avaliação não encontrada' })
        }
        
        // Formatar dados
        const formattedData = {
            ...data,
            usuarios: {
                id: data.usuario_id,
                email: data.usuario_email,
                nome: data.usuario_nome || 'Torcedor'
            }
        }
        
        res.json({ success: true, data: formattedData })
        
    } catch (error) {
        console.error('Erro ao buscar avaliação:', error)
        res.status(500).json({ error: 'Erro interno do servidor' })
    }
})

// ============================================
// POST - Criar nova avaliação
// ============================================
router.post('/', verificarToken, [
    body('estadio_nome').notEmpty().withMessage('Nome do estádio é obrigatório').trim(),
    body('cidade').notEmpty().withMessage('Cidade é obrigatória').trim(),
    body('nota_geral').isInt({ min: 1, max: 5 }),
    body('nota_acesso').isInt({ min: 1, max: 5 }),
    body('nota_seguranca').isInt({ min: 1, max: 5 }),
    body('nota_estrutura').isInt({ min: 1, max: 5 }),
    body('comentario').optional().trim()
], async (req, res) => {
    try {
        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() })
        }
        
        const avaliacao = {
            estadio_nome: req.body.estadio_nome,
            cidade: req.body.cidade,
            nota_geral: req.body.nota_geral,
            nota_acesso: req.body.nota_acesso,
            nota_seguranca: req.body.nota_seguranca,
            nota_estrutura: req.body.nota_estrutura,
            comentario: req.body.comentario || null,
            usuario_id: req.usuario.id,
            data_avaliacao: new Date().toISOString()
        }
        
        const { data, error } = await supabase
            .from('avaliacoes_estadios')
            .insert([avaliacao])
            .select()
            .single()
        
        if (error) {
            console.error('Erro ao inserir:', error)
            return res.status(500).json({ error: error.message })
        }
        
        res.status(201).json({ success: true, data })
        
    } catch (error) {
        console.error('Erro ao criar avaliação:', error)
        res.status(500).json({ error: 'Erro interno do servidor' })
    }
})

// ============================================
// PUT - Atualizar avaliação
// ============================================
router.put('/:id', verificarToken, async (req, res) => {
    try {
        const { id } = req.params
        
        const { data: avaliacaoExistente } = await supabase
            .from('avaliacoes_estadios')
            .select('usuario_id')
            .eq('id', id)
            .single()
        
        if (!avaliacaoExistente) {
            return res.status(404).json({ error: 'Avaliação não encontrada' })
        }
        
        if (avaliacaoExistente.usuario_id !== req.usuario.id) {
            return res.status(403).json({ error: 'Você só pode editar suas próprias avaliações' })
        }
        
        const { data, error } = await supabase
            .from('avaliacoes_estadios')
            .update(req.body)
            .eq('id', id)
            .select()
            .single()
        
        if (error) {
            return res.status(500).json({ error: error.message })
        }
        
        res.json({ success: true, data })
        
    } catch (error) {
        console.error('Erro ao atualizar avaliação:', error)
        res.status(500).json({ error: 'Erro interno do servidor' })
    }
})

// ============================================
// DELETE - Remover avaliação
// ============================================
router.delete('/:id', verificarToken, async (req, res) => {
    try {
        const { id } = req.params
        
        const { data: avaliacaoExistente } = await supabase
            .from('avaliacoes_estadios')
            .select('usuario_id')
            .eq('id', id)
            .single()
        
        if (!avaliacaoExistente) {
            return res.status(404).json({ error: 'Avaliação não encontrada' })
        }
        
        if (avaliacaoExistente.usuario_id !== req.usuario.id) {
            return res.status(403).json({ error: 'Sem permissão para deletar' })
        }
        
        const { error } = await supabase
            .from('avaliacoes_estadios')
            .delete()
            .eq('id', id)
        
        if (error) {
            return res.status(500).json({ error: error.message })
        }
        
        res.json({ success: true, message: 'Avaliação removida' })
        
    } catch (error) {
        console.error('Erro ao deletar avaliação:', error)
        res.status(500).json({ error: 'Erro interno do servidor' })
    }
})

// ============================================
// GET - Ranking dos melhores estádios
// ============================================
router.get('/ranking', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('avaliacoes_estadios')
            .select('estadio_nome, cidade, nota_geral')
        
        if (error) {
            return res.status(500).json({ error: error.message })
        }
        
        const ranking = data.reduce((acc, curr) => {
            const key = `${curr.estadio_nome}|${curr.cidade}`
            if (!acc[key]) {
                acc[key] = {
                    estadio: curr.estadio_nome,
                    cidade: curr.cidade,
                    totalNotas: 0,
                    quantidade: 0
                }
            }
            acc[key].totalNotas += curr.nota_geral
            acc[key].quantidade++
            return acc
        }, {})
        
        const resultado = Object.values(ranking)
            .map(item => ({
                ...item,
                media: (item.totalNotas / item.quantidade).toFixed(1)
            }))
            .sort((a, b) => b.media - a.media)
            .slice(0, 10)
        
        res.json(resultado)
        
    } catch (error) {
        console.error('Erro ao buscar ranking:', error)
        res.status(500).json({ error: 'Erro interno do servidor' })
    }
})

export default router
