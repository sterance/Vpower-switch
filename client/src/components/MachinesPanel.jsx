import { useEffect, useState, useMemo } from 'react'
import { Paper, Typography, CircularProgress, Stack, Button, Box } from '@mui/material'
import MachineCard from './MachineCard'
import client from '../api/client'
import AddMachineDialog from './AddMachineDialog'
import ConfirmDialog from './ConfirmDialog'

function MachinesPanel({ onNotify, refreshKey = 0, openAddKey = 0, onRefresh }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [openAdd, setOpenAdd] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await client.get('/machines')
      setRows(res.data)
    } catch (e) {
      setError('failed to load machines')
      onNotify?.('failed to load machines', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (refreshKey > 0) {
      load()
    }
  }, [refreshKey])

  useEffect(() => {
    if (openAddKey > 0) {
      setOpenAdd(true)
    }
  }, [openAddKey])

  const handleAdd = async (payload) => {
    setSubmitting(true)
    try {
      console.log('Submitting new machine:', payload);
      const res = await client.post('/machines', payload)
      setRows(prev => [...prev, res.data])
      setOpenAdd(false)
      onNotify?.('machine added', 'success')
    } catch (e) {
      console.error('Failed to add machine. Full error response:', e.response?.data || e.message);
      const errorMsg = e.response?.data?.error || 'failed to add machine';
      const details = e.response?.data?.details || '';
      const missing = e.response?.data?.missing;
      
      let fullMessage = errorMsg;
      if (missing && missing.length > 0) {
        fullMessage += ` (Missing: ${missing.join(', ')})`;
      } else if (details) {
        fullMessage += ` (${details})`;
      }
      
      onNotify?.(fullMessage, 'error');
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleted = (id) => {
    setRows(prev => prev.filter(r => r.id !== id))
  }

  const handleEdit = async (payload) => {
    setSubmitting(true)
    try {
      console.log('Updating machine:', payload);
      const res = await client.put(`/machines/${payload.id}`, payload)
      setRows(prev => prev.map(r => r.id === payload.id ? res.data : r))
      onNotify?.('machine updated', 'success')
    } catch (e) {
      console.error('Failed to update machine. Full error response:', e.response?.data || e.message);
      const errorMsg = e.response?.data?.error || 'failed to update machine';
      const details = e.response?.data?.details || '';
      const missing = e.response?.data?.missing;
      
      let fullMessage = errorMsg;
      if (missing && missing.length > 0) {
        fullMessage += ` (Missing: ${missing.join(', ')})`;
      } else if (details) {
        fullMessage += ` (${details})`;
      }
      
      onNotify?.(fullMessage, 'error');
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdited = (machineId) => (payload) => {
    handleEdit({ ...payload, id: machineId })
  }

  const content = useMemo(() => {
    if (loading) {
      return (
        <Stack alignItems="center" sx={{ py: 4 }}>
          <CircularProgress />
        </Stack>
      )
    }
    if (error) {
      return (
        <Stack alignItems="center" sx={{ py: 4 }}>
          <Typography color="error">{error}</Typography>
          <Button sx={{ mt: 2 }} variant="outlined" onClick={load}>Retry</Button>
        </Stack>
      )
    }
    if (rows.length === 0) {
      return (
        <Box sx={{ py: 6, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary">No machines added yet</Typography>
        </Box>
      )
    }
    return (
      <Box 
        sx={{ 
          py: 1,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2
        }}
      >
        {rows.map(row => (
          <Box
            key={row.id}
            sx={{
              width: '100%',
              '@media (min-width: 768px)': {
                width: 'calc(50% - 8px)'
              }
            }}
          >
            <MachineCard machine={row} onDeleted={handleDeleted} onNotify={onNotify} onEdited={handleEdited(row.id)} />
          </Box>
        ))}
      </Box>
    )
  }, [loading, error, rows])

  return (
    <Paper>
      <Box sx={{ px: 2, py: 1.5 }}>
        <Typography variant="h4" textAlign={'center'}>Machines</Typography>
      </Box>
      <Box sx={{ px: 2, pb: 2 }}>
        {content}
      </Box>
      <AddMachineDialog
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        onSubmit={handleAdd}
        submitting={submitting}
      />
    </Paper>
  )
}

export default MachinesPanel