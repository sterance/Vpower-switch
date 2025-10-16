import { Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button } from '@mui/material'

function ConfirmDialog({ open, title, message, confirmText = 'Confirm', cancelText = 'Cancel', onClose, onConfirm }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="confirm-title"
    >
      <DialogTitle id="confirm-title">{title}</DialogTitle>
      {message ? (
        <DialogContent>
          <DialogContentText>{message}</DialogContentText>
        </DialogContent>
      ) : null}
      <DialogActions>
        <Button onClick={onClose}>{cancelText}</Button>
        <Button
          color="error"
          variant="contained"
          onClick={onConfirm}
        >
          {confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default ConfirmDialog


