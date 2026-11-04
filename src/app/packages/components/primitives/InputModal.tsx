import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CloseButton } from './CloseButton';
import { Button } from './button';
import { dialogOverlayMotion, useDialogWindowVariants } from './dialogMotion';
import { t } from '../../../i18n';

interface InputModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  placeholder?: string | undefined;
  defaultValue?: string | undefined;
  onConfirm: (value: string) => void;
  validation?: ((value: string) => string | null) | undefined;
}

const InputModal: React.FC<InputModalProps> = ({
  isOpen,
  onClose,
  title,
  placeholder = '',
  defaultValue = '',
  onConfirm,
  validation
}) => {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const windowVariants = useDialogWindowVariants();

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      setError(null);
      // Focus and select all text when modal opens
      window.setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [isOpen, defaultValue]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleCancel = () => {
    setError(null);
    onClose();
  };

  const handleConfirm = () => {
    const trimmedValue = value.trim();
    
    if (!trimmedValue) {
      setError('Value cannot be empty');
      return;
    }

    if (validation) {
      const validationError = validation(trimmedValue);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    onConfirm(trimmedValue);
    setError(null);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div {...dialogOverlayMotion} className="atlas-modal-overlay" onClick={handleCancel}>
          <motion.div className="atlas-modal atlas-input-modal" variants={windowVariants} onClick={(e) => e.stopPropagation()}>
            <div className="atlas-modal-header">
              <h3>{title}</h3>
              <CloseButton onClick={handleCancel} />
            </div>
        
            <div className="atlas-modal-body">
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError(null);
                }}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className="atlas-input"
              />
              {error && <div className="atlas-input-error">{error}</div>}
            </div>

            <div className="atlas-modal-footer">
              <Button variant="outline" size="sm" onClick={handleCancel}>{t('common.cancel')}</Button>
              <Button variant="default" size="sm" onClick={handleConfirm}>{t('common.confirm')}</Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default InputModal;
