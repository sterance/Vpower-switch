import { useState } from 'react'
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Stack } from '@mui/material'

function AddMachineDialog({ open, onClose, onSubmit, submitting = false }) {
  const [name, setName] = useState('')
  const [mac, setMac] = useState('')
  const [ip, setIp] = useState('')
  const [sshUser, setSshUser] = useState('')

  const canSubmit = name && mac && ip && sshUser

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit({ name, mac, ip, sshUser })
  }

  const handleExited = () => {
    setName('')
    setMac('')
    setIp('')
    setSshUser('')
  }

  return (
    <Dialog open={open} onClose={onClose} slotProps={{ transition: { onExited: handleExited } }}>
      <DialogTitle>Add machine</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1, width: 420, maxWidth: '100%' }}>
          <TextField label="Custom Name" value={name} onChange={e => setName(e.target.value)} autoFocus fullWidth />
          <TextField label="MAC Address" value={mac} onChange={e => setMac(e.target.value)} placeholder="AA:BB:CC:DD:EE:FF" fullWidth />
          <TextField label="IP Address" value={ip} onChange={e => setIp(e.target.value)} placeholder="192.168.1.10" fullWidth />
          <TextField label="SSH Username" value={sshUser} onChange={e => setSshUser(e.target.value)} fullWidth />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!canSubmit || submitting}>add</Button>
      </DialogActions>
    </Dialog>
  )
}

export default AddMachineDialog


