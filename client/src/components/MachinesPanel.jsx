import { useEffect, useState, useMemo } from 'react'
import { Paper, Typography, TableContainer, Table, TableHead, TableRow, TableCell, TableBody, CircularProgress, Stack, Button, Box, IconButton } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import client from '../api/client'
import AddMachineDialog from './AddMachineDialog'
import ConfirmDialog from './ConfirmDialog'

function MachinesPanel({ onNotify, refreshKey = 0, openAddKey = 0 }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [openAdd, setOpenAdd] = useState(false)
  const [deletingId, setDeletingId] = useState('')
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
      const res = await client.post('/machines', payload)
      setRows(prev => [...prev, res.data])
      setOpenAdd(false)
      onNotify?.('machine added', 'success')
    } catch (e) {
      onNotify?.('failed to add machine', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await client.delete(`/machines/${id}`)
      setRows(prev => prev.filter(r => r.id !== id))
      setDeletingId('')
      onNotify?.('machine deleted', 'success')
    } catch (e) {
      onNotify?.('failed to delete machine', 'error')
    }
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
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>MAC</TableCell>
              <TableCell>IP</TableCell>
              <TableCell>SSH</TableCell>
              <TableCell width={120} align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(row => (
              <TableRow key={row.id} hover>
                <TableCell>{row.name}</TableCell>
                <TableCell>{row.mac}</TableCell>
                <TableCell>{row.ip}</TableCell>
                <TableCell>{row.sshUser}</TableCell>
                <TableCell align="right">
                  <IconButton aria-label="delete" onClick={() => setDeletingId(row.id)}>
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    )
  }, [loading, error, rows])

  return (
    <Paper variant="outlined">
      <Box sx={{ px: 2, py: 1.5 }}>
        <Typography variant="h6" textAlign={'center'}>Machines</Typography>
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
      <ConfirmDialog
        open={Boolean(deletingId)}
        title="Delete machine?"
        message="This cannot be undone"
        confirmText="Delete"
        onClose={() => setDeletingId('')}
        onConfirm={() => handleDelete(deletingId)}
      />
    </Paper>
  )
}

export default MachinesPanel